#include <iomanip>
#include <iostream>

#include "patientdedupe/matcher.hpp"

// A tiny demo runner that scores a few illustrative pairs and prints the
// breakdown. Handy for eyeballing behaviour while developing.
namespace {

void print_result(const std::string& title, const pdd::MatchResult& r) {
    std::cout << "\n" << title << "\n";
    std::cout << "  score = " << std::fixed << std::setprecision(3) << r.score
              << "  [" << r.label << "]\n";
    for (const auto& f : r.fields) {
        std::cout << "    " << std::left << std::setw(11) << f.field
                  << std::setprecision(2) << f.similarity
                  << "  (w " << f.weight << ")  " << f.detail << "\n";
    }
}

}  // namespace

int main() {
    const pdd::PatientRecord robert{"Robert", "Smith", "1984-03-12", "M",
                                    "12 Oak St", "Boston", "02118"};
    const pdd::PatientRecord bob{"Bob", "Smith", "1984-03-12", "M",
                                 "12 Oak Street", "Boston", "02118"};
    print_result("Robert Smith vs Bob Smith", pdd::match_records(robert, bob));

    const pdd::PatientRecord mary{"Mary", "Jones", "1990-07-21", "F",
                                  "5 Elm Ave", "Lynn", "01902"};
    const pdd::PatientRecord maria{"Maria", "Jones", "1990-07-12", "F",
                                   "5 Elm Avenue", "Lynn", "01902"};
    print_result("Mary Jones vs Maria Jones (transposed day)",
                 pdd::match_records(mary, maria));

    const pdd::PatientRecord a{"David", "Nguyen", "1975-11-02", "M",
                               "880 Pine Rd", "Quincy", "02169"};
    const pdd::PatientRecord b{"Sarah", "Patel", "1962-01-30", "F",
                               "3 Birch Ln", "Newton", "02458"};
    print_result("David Nguyen vs Sarah Patel (clearly different)",
                 pdd::match_records(a, b));
    return 0;
}
