#include "patientdedupe/metrics.hpp"

#include <algorithm>
#include <vector>

namespace pdd {

// @spec ENGINE-METRIC-001
int levenshtein(const std::string& a, const std::string& b) {
    const size_t n = a.size();
    const size_t m = b.size();
    if (n == 0) return static_cast<int>(m);
    if (m == 0) return static_cast<int>(n);

    // Only keep the previous and current rows instead of the whole matrix.
    std::vector<int> prev(m + 1);
    std::vector<int> curr(m + 1);
    for (size_t j = 0; j <= m; ++j) prev[j] = static_cast<int>(j);

    for (size_t i = 1; i <= n; ++i) {
        curr[0] = static_cast<int>(i);
        for (size_t j = 1; j <= m; ++j) {
            const int cost = (a[i - 1] == b[j - 1]) ? 0 : 1;
            curr[j] = std::min({prev[j] + 1,          // deletion
                                curr[j - 1] + 1,      // insertion
                                prev[j - 1] + cost}); // substitution
        }
        std::swap(prev, curr);
    }
    return prev[m];
}

// @spec ENGINE-METRIC-002
int damerau_levenshtein(const std::string& a, const std::string& b) {
    const size_t n = a.size();
    const size_t m = b.size();
    if (n == 0) return static_cast<int>(m);
    if (m == 0) return static_cast<int>(n);

    // Optimal string alignment needs the two prior rows so it can look back at an
    // adjacent transposition.
    std::vector<int> row0(m + 1);  // i - 2
    std::vector<int> row1(m + 1);  // i - 1
    std::vector<int> row2(m + 1);  // i
    for (size_t j = 0; j <= m; ++j) row1[j] = static_cast<int>(j);

    for (size_t i = 1; i <= n; ++i) {
        row2[0] = static_cast<int>(i);
        for (size_t j = 1; j <= m; ++j) {
            const int cost = (a[i - 1] == b[j - 1]) ? 0 : 1;
            int value = std::min({row1[j] + 1,
                                  row2[j - 1] + 1,
                                  row1[j - 1] + cost});
            if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                value = std::min(value, row0[j - 2] + 1);  // adjacent swap
            }
            row2[j] = value;
        }
        row0 = row1;
        row1 = row2;
    }
    return row1[m];
}

// @spec ENGINE-METRIC-003
double jaro(const std::string& a, const std::string& b) {
    if (a.empty() && b.empty()) return 1.0;
    if (a.empty() || b.empty()) return 0.0;
    if (a == b) return 1.0;

    const int len_a = static_cast<int>(a.size());
    const int len_b = static_cast<int>(b.size());
    // Characters further apart than this window do not count as matches.
    const int window = std::max(0, std::max(len_a, len_b) / 2 - 1);

    std::vector<bool> a_matched(len_a, false);
    std::vector<bool> b_matched(len_b, false);

    int matches = 0;
    for (int i = 0; i < len_a; ++i) {
        const int lo = std::max(0, i - window);
        const int hi = std::min(i + window + 1, len_b);
        for (int j = lo; j < hi; ++j) {
            if (b_matched[j] || a[i] != b[j]) continue;
            a_matched[i] = true;
            b_matched[j] = true;
            ++matches;
            break;
        }
    }
    if (matches == 0) return 0.0;

    // Count transpositions: matched characters that appear out of order.
    double transpositions = 0.0;
    int k = 0;
    for (int i = 0; i < len_a; ++i) {
        if (!a_matched[i]) continue;
        while (!b_matched[k]) ++k;
        if (a[i] != b[k]) transpositions += 1.0;
        ++k;
    }
    transpositions /= 2.0;

    const double m = static_cast<double>(matches);
    return ((m / len_a) + (m / len_b) + ((m - transpositions) / m)) / 3.0;
}

double jaro_winkler(const std::string& a, const std::string& b,
                    double prefix_scale, int max_prefix) {
    const double j = jaro(a, b);
    if (j <= 0.0) return 0.0;

    int prefix = 0;
    const int limit = std::min({max_prefix, static_cast<int>(a.size()),
                                static_cast<int>(b.size())});
    for (int i = 0; i < limit; ++i) {
        if (a[i] != b[i]) break;
        ++prefix;
    }
    return j + prefix * prefix_scale * (1.0 - j);
}

// @spec ENGINE-METRIC-004
double levenshtein_similarity(const std::string& a, const std::string& b) {
    if (a.empty() && b.empty()) return 1.0;
    const int dist = levenshtein(a, b);
    const int longest = std::max(a.size(), b.size());
    return 1.0 - static_cast<double>(dist) / static_cast<double>(longest);
}

}  // namespace pdd
