package com.patientdedupe.analytics;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.conf.Configured;
import org.apache.hadoop.fs.FileStatus;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Job;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;
import org.apache.hadoop.mapreduce.lib.input.FileInputFormat;
import org.apache.hadoop.mapreduce.lib.output.FileOutputFormat;
import org.apache.hadoop.util.Tool;
import org.apache.hadoop.util.ToolRunner;

// The duplicate-rate-by-site job as two chained MapReduce passes. Job 1 groups by
// person_key to label each record as primary or duplicate and re-emits keyed by site;
// job 2 aggregates per site. The driver then reads the few per-site rows, orders them by
// rate descending (ties by site name), and writes the final CSV report. The same jar runs
// on a single-node cluster or, with mapreduce.framework.name=local, in local mode.
//
// @spec ANALYTICS-001, ANALYTICS-006, ANALYTICS-008
public final class AnalyticsDriver extends Configured implements Tool {

  // Job 1: key by person cluster ("P:<key>" for a real person, "S:<id>" for a null-key
  // singleton so it never clusters), value "id\tsite".
  // @spec ANALYTICS-002, ANALYTICS-004
  public static final class LabelMapper extends Mapper<Object, Text, Text, Text> {
    @Override
    protected void map(Object key, Text value, Context context) throws IOException, InterruptedException {
      String line = value.toString().trim();
      if (line.isEmpty()) {
        return;
      }
      Row r = Row.parse(line);
      String clusterKey = r.personKey() != null ? "P:" + r.personKey() : "S:" + r.id();
      context.write(new Text(clusterKey), new Text(r.id() + "\t" + r.site()));
    }
  }

  // Job 1 reducer: the minimum id in the cluster is the primary; every other record is a
  // duplicate. Re-emit each record keyed by site as "records,duplicates".
  // @spec ANALYTICS-002, ANALYTICS-003
  public static final class LabelReducer extends Reducer<Text, Text, Text, Text> {
    @Override
    protected void reduce(Text key, Iterable<Text> values, Context context) throws IOException, InterruptedException {
      List<String[]> cluster = new ArrayList<>();
      long primaryId = Long.MAX_VALUE;
      for (Text v : values) {
        String[] parts = v.toString().split("\t", 2);
        long id = Long.parseLong(parts[0]);
        cluster.add(new String[] {parts[0], parts[1]});
        primaryId = Math.min(primaryId, id);
      }
      for (String[] rec : cluster) {
        int duplicate = Long.parseLong(rec[0]) != primaryId ? 1 : 0;
        context.write(new Text(rec[1]), new Text("1," + duplicate));
      }
    }
  }

  // Job 2: parse job 1 output ("site\trecords,duplicates"), key by site.
  public static final class AggregateMapper extends Mapper<Object, Text, Text, Text> {
    @Override
    protected void map(Object key, Text value, Context context) throws IOException, InterruptedException {
      String line = value.toString();
      int tab = line.indexOf('\t');
      if (tab < 0) {
        return;
      }
      context.write(new Text(line.substring(0, tab)), new Text(line.substring(tab + 1)));
    }
  }

  // Job 2 combiner and reducer: sum the (records, duplicates) per site.
  // @spec ANALYTICS-003
  public static final class AggregateReducer extends Reducer<Text, Text, Text, Text> {
    @Override
    protected void reduce(Text key, Iterable<Text> values, Context context) throws IOException, InterruptedException {
      long records = 0;
      long duplicates = 0;
      for (Text v : values) {
        String[] p = v.toString().split(",");
        records += Long.parseLong(p[0]);
        duplicates += Long.parseLong(p[1]);
      }
      context.write(key, new Text(records + "," + duplicates));
    }
  }

  @Override
  public int run(String[] args) throws Exception {
    Configuration conf = getConf();
    Path input = new Path(args[0]);
    Path output = new Path(args[1]);
    Path stage1 = new Path(output + "-stage1");
    Path stage2 = new Path(output + "-stage2");

    FileSystem fs = FileSystem.get(conf);
    for (Path p : new Path[] {output, stage1, stage2}) {
      if (fs.exists(p)) {
        fs.delete(p, true);
      }
    }

    Job job1 = Job.getInstance(conf, "label-duplicates");
    job1.setJarByClass(AnalyticsDriver.class);
    job1.setMapperClass(LabelMapper.class);
    job1.setReducerClass(LabelReducer.class);
    job1.setOutputKeyClass(Text.class);
    job1.setOutputValueClass(Text.class);
    FileInputFormat.addInputPath(job1, input);
    FileOutputFormat.setOutputPath(job1, stage1);
    if (!job1.waitForCompletion(true)) {
      return 1;
    }

    Job job2 = Job.getInstance(conf, "aggregate-by-site");
    job2.setJarByClass(AnalyticsDriver.class);
    job2.setMapperClass(AggregateMapper.class);
    job2.setCombinerClass(AggregateReducer.class);
    job2.setReducerClass(AggregateReducer.class);
    job2.setOutputKeyClass(Text.class);
    job2.setOutputValueClass(Text.class);
    FileInputFormat.addInputPath(job2, stage1);
    FileOutputFormat.setOutputPath(job2, stage2);
    if (!job2.waitForCompletion(true)) {
      return 1;
    }

    writeReport(fs, stage2, output);
    fs.delete(stage1, true);
    fs.delete(stage2, true);
    return 0;
  }

  // Read the per-site rows from job 2, order by rate descending then site ascending
  // (ANALYTICS-005), and write the final "site,records,duplicates,rate" report.
  // @spec ANALYTICS-005
  private static void writeReport(FileSystem fs, Path stage2, Path output) throws IOException {
    List<SiteMetric> metrics = new ArrayList<>();
    for (FileStatus st : fs.listStatus(stage2, p -> p.getName().startsWith("part"))) {
      try (BufferedReader br = new BufferedReader(
          new InputStreamReader(fs.open(st.getPath()), StandardCharsets.UTF_8))) {
        String line;
        while ((line = br.readLine()) != null) {
          if (line.isEmpty()) {
            continue;
          }
          int tab = line.indexOf('\t');
          String site = line.substring(0, tab);
          String[] rd = line.substring(tab + 1).split(",");
          metrics.add(new SiteMetric(site, Long.parseLong(rd[0]), Long.parseLong(rd[1])));
        }
      }
    }
    metrics.sort(Comparator.comparingDouble(SiteMetric::rate).reversed().thenComparing(SiteMetric::site));

    fs.mkdirs(output);
    try (BufferedWriter bw = new BufferedWriter(
        new OutputStreamWriter(fs.create(new Path(output, "part-r-00000")), StandardCharsets.UTF_8))) {
      for (SiteMetric m : metrics) {
        bw.write(m.site() + "," + m.records() + "," + m.duplicates() + "," + m.rateRounded().toPlainString());
        bw.newLine();
      }
    }
  }

  public static void main(String[] args) throws Exception {
    System.exit(ToolRunner.run(new AnalyticsDriver(), args));
  }
}
