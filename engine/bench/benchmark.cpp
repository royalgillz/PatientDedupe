#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

#include "patientdedupe/matcher.hpp"

// Measures raw scoring throughput in candidate pairs per second. The point is a
// concrete, repeatable number we can compare against the Python baseline in
// tools/eval. It is a microbenchmark of the engine only, with no I/O or
// blocking, so it isolates the cost of the math.
namespace {

std::vector<pdd::PatientRecord> build_pool(int n) {
    static const char* firsts[] = {"Robert", "Bob", "Mary", "Maria", "David",
                                   "Sarah", "James", "Jim", "Patricia", "Pat"};
    static const char* lasts[] = {"Smith", "Jones", "Nguyen", "Patel", "Garcia",
                                  "Williams", "OBrien", "Lee", "Chen", "Khan"};
    static const char* cities[] = {"Boston", "Lynn", "Quincy", "Salem", "Newton"};
    std::vector<pdd::PatientRecord> pool;
    pool.reserve(n);
    for (int i = 0; i < n; ++i) {
        pdd::PatientRecord r;
        r.first_name = firsts[i % 10];
        r.last_name = lasts[(i / 3) % 10];
        const int year = 1950 + (i % 60);
        const int month = 1 + (i % 12);
        const int day = 1 + (i % 28);
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%04d-%02d-%02d", year, month, day);
        r.dob = buf;
        r.gender = (i % 2) ? "M" : "F";
        r.address = std::to_string(10 + i % 900) + " Oak Street";
        r.city = cities[i % 5];
        r.zip = std::to_string(1000 + i % 90000);
        pool.push_back(std::move(r));
    }
    return pool;
}

}  // namespace

int main(int argc, char** argv) {
    const long target = (argc > 1) ? std::stol(argv[1]) : 5'000'000L;
    const auto pool = build_pool(2000);
    const int n = static_cast<int>(pool.size());

    // warm up so we are not timing the first cache misses
    volatile double sink = 0.0;
    for (int i = 0; i < 10000; ++i) {
        sink += pdd::match_records(pool[i % n], pool[(i * 7 + 1) % n]).score;
    }

    const auto start = std::chrono::steady_clock::now();
    long done = 0;
    for (long i = 0; i < target; ++i) {
        const auto& a = pool[i % n];
        const auto& b = pool[(i * 7 + 1) % n];
        sink += pdd::match_records(a, b).score;
        ++done;
    }
    const auto end = std::chrono::steady_clock::now();

    const double seconds = std::chrono::duration<double>(end - start).count();
    const double per_sec = done / seconds;
    std::printf("engine: scored %ld pairs in %.3f s = %.0f pairs/sec\n",
                done, seconds, per_sec);
    std::printf("(checksum %.3f)\n", static_cast<double>(sink));
    return 0;
}
