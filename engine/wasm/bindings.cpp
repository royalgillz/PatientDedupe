#include <emscripten/bind.h>

#include <sstream>
#include <string>

#include "patientdedupe/matcher.hpp"

// WebAssembly entry point. The browser hands us two patient records as plain JS
// objects (marshalled into PatientRecord by embind's value_object), we run the very
// same C++ matcher the native build and tests use, and we hand back a JSON string.
// Returning JSON keeps the JavaScript side simple: it gets a normal object with a
// real array of field reasons, instead of an embind vector wrapper.
namespace {

std::string escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            default: out.push_back(c);
        }
    }
    return out;
}

std::string match_records_json(const pdd::PatientRecord& a, const pdd::PatientRecord& b) {
    const pdd::MatchResult r = pdd::match_records(a, b);
    std::ostringstream os;
    os << "{\"score\":" << r.score << ",\"label\":\"" << escape(r.label) << "\",\"fields\":[";
    for (size_t i = 0; i < r.fields.size(); ++i) {
        const auto& f = r.fields[i];
        if (i) os << ",";
        os << "{\"field\":\"" << escape(f.field) << "\","
           << "\"similarity\":" << f.similarity << ","
           << "\"weight\":" << f.weight << ","
           << "\"detail\":\"" << escape(f.detail) << "\"}";
    }
    os << "]}";
    return os.str();
}

}  // namespace

EMSCRIPTEN_BINDINGS(patientdedupe) {
    emscripten::value_object<pdd::PatientRecord>("PatientRecord")
        .field("first_name", &pdd::PatientRecord::first_name)
        .field("last_name", &pdd::PatientRecord::last_name)
        .field("dob", &pdd::PatientRecord::dob)
        .field("gender", &pdd::PatientRecord::gender)
        .field("address", &pdd::PatientRecord::address)
        .field("city", &pdd::PatientRecord::city)
        .field("zip", &pdd::PatientRecord::zip);

    emscripten::function("matchRecordsJson", &match_records_json);
}
