#pragma once

#include <string>

// String-similarity metrics used by the matcher. These are implemented by hand
// rather than pulled from a library, both because it is the point of the exercise
// and because we want full control over the scoring behaviour.
namespace pdd {

// Classic Levenshtein edit distance: the minimum number of single-character
// insertions, deletions, or substitutions to turn a into b.
int levenshtein(const std::string& a, const std::string& b);

// Optimal string alignment distance. Like Levenshtein but it also counts a swap
// of two adjacent characters as a single edit, which matches how people fat-finger
// dates and names (for example 1984 typed as 1894).
int damerau_levenshtein(const std::string& a, const std::string& b);

// Jaro similarity in [0, 1]. Rewards matching characters that are close to each
// other and penalises transpositions. Good for short strings like names.
double jaro(const std::string& a, const std::string& b);

// Jaro-Winkler similarity in [0, 1]. Jaro with an extra boost when the strings
// share a common prefix, which is a strong signal for human names.
double jaro_winkler(const std::string& a, const std::string& b,
                    double prefix_scale = 0.1, int max_prefix = 4);

// Edit-distance similarity in [0, 1], defined as 1 - distance / longest length.
// Handier than a raw distance when you want every field on the same 0 to 1 scale.
double levenshtein_similarity(const std::string& a, const std::string& b);

}  // namespace pdd
