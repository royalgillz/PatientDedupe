#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "patientdedupe/matcher.hpp"

// Reads the labelled pairs produced by tools/eval/duplicate_injector.py and reports how
// well the engine separates true duplicates from non-duplicates. Because the labels
// are ground truth, precision and recall here are real correctness numbers, not
// guesses. We report two operating points: the auto-merge threshold (high
// precision) and the review threshold (higher recall).
namespace {

std::vector<std::string> split_csv(const std::string& line) {
    std::vector<std::string> out;
    std::string cell;
    std::stringstream ss(line);
    while (std::getline(ss, cell, ',')) out.push_back(cell);
    return out;
}

struct Scored {
    double score;
    bool is_duplicate;
};

void report(const char* name, const std::vector<Scored>& rows, double threshold) {
    long tp = 0, fp = 0, fn = 0, tn = 0;
    for (const auto& r : rows) {
        const bool predicted = r.score >= threshold;
        if (predicted && r.is_duplicate) ++tp;
        else if (predicted && !r.is_duplicate) ++fp;
        else if (!predicted && r.is_duplicate) ++fn;
        else ++tn;
    }
    const double precision = (tp + fp) ? static_cast<double>(tp) / (tp + fp) : 0.0;
    const double recall = (tp + fn) ? static_cast<double>(tp) / (tp + fn) : 0.0;
    const double f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0.0;
    std::printf("%-26s thr=%.2f  precision=%.3f  recall=%.3f  f1=%.3f  (tp=%ld fp=%ld fn=%ld tn=%ld)\n",
                name, threshold, precision, recall, f1, tp, fp, fn, tn);
}

}  // namespace

int main(int argc, char** argv) {
    const std::string path = (argc > 1) ? argv[1] : "../data/pairs.csv";
    std::ifstream in(path);
    if (!in) {
        std::fprintf(stderr, "cannot open %s\n", path.c_str());
        return 1;
    }

    std::string header;
    std::getline(in, header);  // skip header row

    std::vector<Scored> rows;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        const auto c = split_csv(line);
        if (c.size() < 15) continue;
        const pdd::PatientRecord a{c[0], c[1], c[2], c[3], c[4], c[5], c[6]};
        const pdd::PatientRecord b{c[7], c[8], c[9], c[10], c[11], c[12], c[13]};
        const bool is_dup = (c[14] == "1");
        rows.push_back({pdd::match_records(a, b).score, is_dup});
    }

    std::printf("evaluated %zu labelled pairs from %s\n", rows.size(), path.c_str());
    report("auto-merge (match)", rows, pdd::kMatchThreshold);
    report("review-inclusive", rows, pdd::kReviewThreshold);
    return 0;
}
