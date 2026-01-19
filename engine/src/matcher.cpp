#include "patientdedupe/matcher.hpp"

#include <algorithm>
#include <cctype>
#include <string>
#include <unordered_map>

#include "patientdedupe/metrics.hpp"
#include "patientdedupe/nicknames.hpp"

namespace pdd {

namespace {

std::string to_lower(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    return out;
}

// Lowercase, drop punctuation, and squeeze runs of whitespace down to one space.
// Used so "12 Oak St." and "12 oak  st" compare as the same text.
std::string normalize_text(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    bool last_space = false;
    for (char c : s) {
        const unsigned char uc = static_cast<unsigned char>(c);
        if (std::isspace(uc)) {
            if (!out.empty() && !last_space) {
                out.push_back(' ');
                last_space = true;
            }
            continue;
        }
        if (std::isalnum(uc)) {
            out.push_back(static_cast<char>(std::tolower(uc)));
            last_space = false;
        }
        // any other punctuation is simply dropped
    }
    if (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

// Expand the most common US street-type abbreviations so that "Street" and "St"
// do not look like a mismatch. Runs on already-normalized, space-split tokens.
std::string normalize_address(const std::string& s) {
    static const std::unordered_map<std::string, std::string> expand = {
        {"st", "street"}, {"str", "street"}, {"ave", "avenue"}, {"av", "avenue"},
        {"rd", "road"}, {"dr", "drive"}, {"ln", "lane"}, {"ct", "court"},
        {"blvd", "boulevard"}, {"hwy", "highway"}, {"pkwy", "parkway"},
        {"pl", "place"}, {"ter", "terrace"}, {"cir", "circle"}, {"sq", "square"},
        {"apt", "apartment"}, {"ste", "suite"}, {"n", "north"}, {"s", "south"},
        {"e", "east"}, {"w", "west"},
    };
    const std::string base = normalize_text(s);
    std::string out;
    out.reserve(base.size());
    size_t i = 0;
    while (i < base.size()) {
        size_t j = base.find(' ', i);
        if (j == std::string::npos) j = base.size();
        std::string token = base.substr(i, j - i);
        const auto it = expand.find(token);
        if (it != expand.end()) token = it->second;
        if (!out.empty()) out.push_back(' ');
        out += token;
        i = j + 1;
    }
    return out;
}

// Keep only the digits, so "1984-03-12" becomes "19840312".
std::string digits_only(const std::string& s) {
    std::string out;
    for (char c : s) {
        if (std::isdigit(static_cast<unsigned char>(c))) out.push_back(c);
    }
    return out;
}

FieldScore score_first_name(const std::string& a, const std::string& b) {
    const std::string na = normalize_text(a);
    const std::string nb = normalize_text(b);
    double sim = jaro_winkler(na, nb);
    std::string detail = "Jaro-Winkler";

    // If the spelled names differ but resolve to the same canonical name, this is a
    // nickname, which is a strong same-person signal.
    if (na != nb) {
        const std::string ca = canonical_given_name(a);
        const std::string cb = canonical_given_name(b);
        if (!ca.empty() && ca == cb) {
            const double boosted = std::max(sim, 0.95);
            if (boosted > sim) {
                sim = boosted;
                detail = "nickname match (" + na + " = " + nb + ")";
            }
        }
    } else {
        detail = "exact";
    }
    return {"first_name", sim, 0.0, detail};
}

FieldScore score_last_name(const std::string& a, const std::string& b) {
    const std::string na = normalize_text(a);
    const std::string nb = normalize_text(b);
    const double sim = jaro_winkler(na, nb);
    return {"last_name", sim, 0.0, na == nb ? "exact" : "Jaro-Winkler"};
}

FieldScore score_dob(const std::string& a, const std::string& b) {
    const std::string da = digits_only(a);
    const std::string db = digits_only(b);
    if (da.empty() || db.empty()) return {"dob", 0.0, 0.0, "missing"};
    if (da == db) return {"dob", 1.0, 0.0, "exact"};

    const int dist = damerau_levenshtein(da, db);
    const int longest = std::max(da.size(), db.size());
    double sim = 1.0 - static_cast<double>(dist) / static_cast<double>(longest);

    // Sharing the birth year is meaningful on its own, so floor the score when the
    // first four digits line up.
    std::string detail = std::to_string(dist) + (dist == 1 ? " digit differs" : " digits differ");
    if (da.size() >= 4 && db.size() >= 4 && da.substr(0, 4) == db.substr(0, 4)) {
        sim = std::max(sim, 0.55);
        if (dist == 2) detail = "likely transposed digits";
    }
    sim = std::max(0.0, sim);
    return {"dob", sim, 0.0, detail};
}

FieldScore score_gender(const std::string& a, const std::string& b) {
    const std::string na = to_lower(a);
    const std::string nb = to_lower(b);
    if (na.empty() || nb.empty()) return {"gender", 0.0, 0.0, "missing"};
    const bool same = (na[0] == nb[0]);
    return {"gender", same ? 1.0 : 0.0, 0.0, same ? "same" : "different"};
}

FieldScore score_address(const std::string& a, const std::string& b) {
    const std::string na = normalize_address(a);
    const std::string nb = normalize_address(b);
    if (na.empty() || nb.empty()) return {"address", 0.0, 0.0, "missing"};
    const double sim = levenshtein_similarity(na, nb);
    return {"address", sim, 0.0, na == nb ? "exact" : "edit-distance"};
}

FieldScore score_city(const std::string& a, const std::string& b) {
    const std::string na = normalize_text(a);
    const std::string nb = normalize_text(b);
    if (na.empty() || nb.empty()) return {"city", 0.0, 0.0, "missing"};
    const double sim = jaro_winkler(na, nb);
    return {"city", sim, 0.0, na == nb ? "exact" : "Jaro-Winkler"};
}

FieldScore score_zip(const std::string& a, const std::string& b) {
    const std::string da = digits_only(a);
    const std::string db = digits_only(b);
    if (da.empty() || db.empty()) return {"zip", 0.0, 0.0, "missing"};
    const std::string fa = da.substr(0, std::min<size_t>(5, da.size()));
    const std::string fb = db.substr(0, std::min<size_t>(5, db.size()));
    if (fa == fb) return {"zip", 1.0, 0.0, "exact"};
    if (fa.size() >= 3 && fb.size() >= 3 && fa.substr(0, 3) == fb.substr(0, 3)) {
        return {"zip", 0.5, 0.0, "same area"};
    }
    return {"zip", 0.0, 0.0, "different"};
}

std::string label_for(double score) {
    if (score >= kMatchThreshold) return "match";
    if (score >= kReviewThreshold) return "review";
    return "no-match";
}

}  // namespace

// @spec ENGINE-001, ENGINE-002, ENGINE-003, ENGINE-004, ENGINE-005, ENGINE-006, ENGINE-007, ENGINE-008
MatchResult match_records(const PatientRecord& a, const PatientRecord& b,
                          const Weights& weights) {
    std::vector<FieldScore> fields;
    fields.reserve(7);

    fields.push_back(score_last_name(a.last_name, b.last_name));
    fields.back().weight = weights.last_name;
    fields.push_back(score_first_name(a.first_name, b.first_name));
    fields.back().weight = weights.first_name;
    fields.push_back(score_dob(a.dob, b.dob));
    fields.back().weight = weights.dob;
    fields.push_back(score_address(a.address, b.address));
    fields.back().weight = weights.address;
    fields.push_back(score_city(a.city, b.city));
    fields.back().weight = weights.city;
    fields.push_back(score_zip(a.zip, b.zip));
    fields.back().weight = weights.zip;
    fields.push_back(score_gender(a.gender, b.gender));
    fields.back().weight = weights.gender;

    double weighted = 0.0;
    double total_weight = 0.0;
    for (const auto& f : fields) {
        weighted += f.similarity * f.weight;
        total_weight += f.weight;
    }
    const double score = total_weight > 0.0 ? weighted / total_weight : 0.0;

    return {score, label_for(score), std::move(fields)};
}

}  // namespace pdd
