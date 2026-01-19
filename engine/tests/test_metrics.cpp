#include "catch2/catch_amalgamated.hpp"

#include "patientdedupe/metrics.hpp"

using namespace pdd;

// @spec ENGINE-METRIC-001
TEST_CASE("Levenshtein counts single-edit distances", "[metrics]") {
    CHECK(levenshtein("", "") == 0);
    CHECK(levenshtein("abc", "abc") == 0);
    CHECK(levenshtein("kitten", "sitting") == 3);
    CHECK(levenshtein("flaw", "lawn") == 2);
    CHECK(levenshtein("abc", "") == 3);
}

// @spec ENGINE-METRIC-002
TEST_CASE("Damerau-Levenshtein treats an adjacent swap as one edit", "[metrics]") {
    CHECK(damerau_levenshtein("ca", "ac") == 1);
    CHECK(damerau_levenshtein("19840312", "19840321") == 1);  // swapped last two
    CHECK(damerau_levenshtein("abc", "abc") == 0);
    // a plain Levenshtein would call this swap two edits
    CHECK(levenshtein("ca", "ac") == 2);
}

// @spec ENGINE-METRIC-003
TEST_CASE("Jaro and Jaro-Winkler stay within range and reward prefixes", "[metrics]") {
    CHECK(jaro("martha", "martha") == Catch::Approx(1.0));
    CHECK(jaro("", "abc") == Catch::Approx(0.0));

    const double j = jaro("martha", "marhta");
    CHECK(j > 0.9);
    CHECK(j < 1.0);

    // the shared prefix should push Jaro-Winkler at or above plain Jaro
    CHECK(jaro_winkler("martha", "marhta") >= j);
    CHECK(jaro_winkler("dwayne", "duane") > 0.8);
}

// @spec ENGINE-METRIC-004
TEST_CASE("Edit-distance similarity is normalised to 0..1", "[metrics]") {
    CHECK(levenshtein_similarity("", "") == Catch::Approx(1.0));
    CHECK(levenshtein_similarity("abc", "abc") == Catch::Approx(1.0));
    CHECK(levenshtein_similarity("abc", "abd") == Catch::Approx(1.0 - 1.0 / 3.0));
    CHECK(levenshtein_similarity("abcd", "wxyz") == Catch::Approx(0.0));
}
