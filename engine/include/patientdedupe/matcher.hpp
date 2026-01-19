#pragma once

#include <string>
#include <vector>

namespace pdd {

// The slice of a patient record that we actually match on. Everything is a string
// because that is how it arrives from the database and from FHIR, and because the
// metrics work on text. Dates are expected as ISO yyyy-mm-dd.
struct PatientRecord {
    std::string first_name;
    std::string last_name;
    std::string dob;
    std::string gender;
    std::string address;
    std::string city;
    std::string zip;
};

// How much each field contributes to the overall score. They do not have to sum to
// one; the matcher normalises by the total so the weights stay easy to reason about
// and tune.
struct Weights {
    double last_name = 0.24;
    double first_name = 0.20;
    double dob = 0.30;
    double address = 0.10;
    double city = 0.06;
    double zip = 0.06;
    double gender = 0.04;
};

// One field's contribution, kept so the UI and the audit trail can always explain
// exactly why a pair scored the way it did.
struct FieldScore {
    std::string field;
    double similarity;  // [0, 1]
    double weight;
    std::string detail;  // short human-readable note
};

struct MatchResult {
    double score;             // weighted overall similarity in [0, 1]
    std::string label;        // "match", "review", or "no-match"
    std::vector<FieldScore> fields;
};

// Decision thresholds. At or above match: confident enough to auto-merge. Between
// review and match: send to a human. Below review: treat as different people.
constexpr double kMatchThreshold = 0.90;
constexpr double kReviewThreshold = 0.70;

// Score one candidate pair. Pure and side-effect free, so it is cheap to call
// millions of times in a benchmark and safe to expose through WebAssembly.
MatchResult match_records(const PatientRecord& a, const PatientRecord& b,
                          const Weights& weights = Weights{});

}  // namespace pdd
