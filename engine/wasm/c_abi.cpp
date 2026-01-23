// A second WebAssembly binding for the engine, beside the embind one in bindings.cpp.
// embind produces JavaScript-only glue; this exposes a plain C ABI so a non-JS host (the
// JVM, through Chicory) can call the very same C++ matcher. The matching math is still
// written once in matcher.cpp; only the calling convention differs.
//
// The host writes the two records' fields into wasm linear memory, calls pdd_match with
// the pointers, reads the returned JSON string, and frees the buffers. JSON is built here
// by hand (no iostream) so the module stays a small, dependency-light standalone wasm.

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <string>

#include "patientdedupe/matcher.hpp"

namespace {

void append_escaped(std::string& out, const std::string& s) {
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            default: out.push_back(c);
        }
    }
}

void append_number(std::string& out, double value) {
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%g", value);
    out += buf;
}

const char* safe(const char* s) {
    return s ? s : "";
}

}  // namespace

extern "C" {

// The host allocates input buffers and frees everything it gets a pointer to.
void* pdd_alloc(size_t n) {
    return std::malloc(n);
}

void pdd_free(void* p) {
    std::free(p);
}

// Score one pair. Each record is passed as its seven fields. Returns a pointer to a
// malloc'd, null-terminated JSON string the caller must release with pdd_free.
char* pdd_match(
    const char* a_first, const char* a_last, const char* a_dob, const char* a_gender,
    const char* a_address, const char* a_city, const char* a_zip,
    const char* b_first, const char* b_last, const char* b_dob, const char* b_gender,
    const char* b_address, const char* b_city, const char* b_zip) {
    const pdd::PatientRecord a{
        safe(a_first), safe(a_last), safe(a_dob), safe(a_gender),
        safe(a_address), safe(a_city), safe(a_zip)};
    const pdd::PatientRecord b{
        safe(b_first), safe(b_last), safe(b_dob), safe(b_gender),
        safe(b_address), safe(b_city), safe(b_zip)};

    const pdd::MatchResult r = pdd::match_records(a, b);

    std::string out;
    out += "{\"score\":";
    append_number(out, r.score);
    out += ",\"label\":\"";
    append_escaped(out, r.label);
    out += "\",\"fields\":[";
    for (size_t i = 0; i < r.fields.size(); ++i) {
        const pdd::FieldScore& f = r.fields[i];
        if (i) out += ",";
        out += "{\"field\":\"";
        append_escaped(out, f.field);
        out += "\",\"similarity\":";
        append_number(out, f.similarity);
        out += ",\"weight\":";
        append_number(out, f.weight);
        out += ",\"detail\":\"";
        append_escaped(out, f.detail);
        out += "\"}";
    }
    out += "]}";

    char* buf = static_cast<char*>(std::malloc(out.size() + 1));
    std::memcpy(buf, out.c_str(), out.size() + 1);
    return buf;
}

}  // extern "C"
