#include "catch2/catch_amalgamated.hpp"

#include "patientdedupe/matcher.hpp"

using namespace pdd;

namespace {
const FieldScore& field(const MatchResult& r, const std::string& name) {
    for (const auto& f : r.fields) {
        if (f.field == name) return f;
    }
    FAIL("missing field: " << name);
    return r.fields.front();
}
}  // namespace

// @spec ENGINE-001
TEST_CASE("Identical records score a perfect, confident match", "[matcher]") {
    PatientRecord a{"Robert", "Smith", "1984-03-12", "M", "12 Oak St", "Boston", "02118"};
    MatchResult r = match_records(a, a);
    CHECK(r.score == Catch::Approx(1.0));
    CHECK(r.label == "match");
    CHECK(r.fields.size() == 7);
}

// @spec ENGINE-002
TEST_CASE("A nickname resolves to a strong first-name match", "[matcher]") {
    PatientRecord robert{"Robert", "Smith", "1984-03-12", "M", "12 Oak St", "Boston", "02118"};
    PatientRecord bob{"Bob", "Smith", "1984-03-12", "M", "12 Oak Street", "Boston", "02118"};
    MatchResult r = match_records(robert, bob);
    CHECK(field(r, "first_name").similarity >= 0.95);
    CHECK(field(r, "first_name").detail.find("nickname") != std::string::npos);
    CHECK(r.label == "match");
}

// @spec ENGINE-007
TEST_CASE("A transposed birth-date digit is a partial, not total, mismatch", "[matcher]") {
    PatientRecord mary{"Mary", "Jones", "1990-07-21", "F", "5 Elm Ave", "Lynn", "01902"};
    PatientRecord maria{"Maria", "Jones", "1990-07-12", "F", "5 Elm Avenue", "Lynn", "01902"};
    const FieldScore& dob = field(match_records(mary, maria), "dob");
    CHECK(dob.similarity > 0.5);
    CHECK(dob.similarity < 1.0);
}

// @spec ENGINE-008
TEST_CASE("Street-type abbreviations do not count as an address mismatch", "[matcher]") {
    PatientRecord a{"Jane", "Doe", "2000-01-01", "F", "12 Oak St", "Boston", "02118"};
    PatientRecord b{"Jane", "Doe", "2000-01-01", "F", "12 Oak Street", "Boston", "02118"};
    CHECK(field(match_records(a, b), "address").similarity == Catch::Approx(1.0));
}

// @spec ENGINE-003, ENGINE-004, ENGINE-005
TEST_CASE("Clearly different people fall below the review threshold", "[matcher]") {
    PatientRecord a{"David", "Nguyen", "1975-11-02", "M", "880 Pine Rd", "Quincy", "02169"};
    PatientRecord b{"Sarah", "Patel", "1962-01-30", "F", "3 Birch Ln", "Newton", "02458"};
    MatchResult r = match_records(a, b);
    CHECK(r.score < kReviewThreshold);
    CHECK(r.label == "no-match");
}

// @spec ENGINE-006
TEST_CASE("Every comparison returns a per-field reason breakdown", "[matcher]") {
    PatientRecord a{"Anna", "Lee", "1988-05-09", "F", "7 Maple Dr", "Salem", "01970"};
    PatientRecord b{"Anna", "Lee", "1988-05-09", "F", "7 Maple Drive", "Salem", "01970"};
    MatchResult r = match_records(a, b);
    REQUIRE(r.fields.size() == 7);
    for (const auto& f : r.fields) {
        CHECK(f.similarity >= 0.0);
        CHECK(f.similarity <= 1.0);
        CHECK_FALSE(f.detail.empty());
    }
}
