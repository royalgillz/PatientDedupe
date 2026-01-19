#include "patientdedupe/nicknames.hpp"

#include <algorithm>
#include <cctype>
#include <unordered_map>
#include <vector>

namespace pdd {

namespace {

// Each row is one family of names. The first entry is the canonical key and every
// entry in the row (including the first) maps to it. This list is deliberately
// short and US-centric; a production system would load a far larger gazetteer.
const std::vector<std::vector<std::string>>& nickname_families() {
    static const std::vector<std::vector<std::string>> families = {
        {"robert", "rob", "bob", "bobby", "bert", "robbie"},
        {"william", "will", "bill", "billy", "willie", "liam"},
        {"richard", "rich", "rick", "ricky", "dick", "richie"},
        {"james", "jim", "jimmy", "jamie", "jem"},
        {"john", "jack", "johnny", "jon"},
        {"joseph", "joe", "joey", "jos"},
        {"charles", "charlie", "chuck", "chas"},
        {"thomas", "tom", "tommy", "thom"},
        {"michael", "mike", "mickey", "mick"},
        {"daniel", "dan", "danny"},
        {"matthew", "matt", "matty"},
        {"christopher", "chris", "topher"},
        {"anthony", "tony", "ant"},
        {"david", "dave", "davey"},
        {"edward", "ed", "eddie", "ted", "ned"},
        {"benjamin", "ben", "benny", "benji"},
        {"samuel", "sam", "sammy"},
        {"nicholas", "nick", "nicky"},
        {"alexander", "alex", "al", "xander"},
        {"andrew", "andy", "drew"},
        {"elizabeth", "liz", "beth", "betty", "eliza", "lizzie", "betsy"},
        {"margaret", "maggie", "meg", "peggy", "marge", "greta"},
        {"katherine", "kate", "katie", "kathy", "cathy", "kat", "katharine", "catherine"},
        {"jennifer", "jen", "jenny", "jenn"},
        {"patricia", "pat", "patty", "trish", "tricia"},
        {"susan", "sue", "susie", "suzy"},
        {"deborah", "deb", "debbie", "debra"},
        {"barbara", "barb", "babs"},
        {"jessica", "jess", "jessie"},
        {"rebecca", "becca", "becky", "reba"},
        {"victoria", "vicky", "tori", "vic"},
        {"stephanie", "steph", "stevie"},
        {"christine", "chris", "chrissy", "christina", "tina"},
        {"abigail", "abby", "abbie"},
        {"alexandra", "alex", "lexi", "sandra", "sandy"},
    };
    return families;
}

std::string to_lower_trim(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        if (std::isspace(static_cast<unsigned char>(c))) continue;
        out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    }
    return out;
}

}  // namespace

std::string canonical_given_name(const std::string& name) {
    static const std::unordered_map<std::string, std::string> lookup = [] {
        std::unordered_map<std::string, std::string> map;
        for (const auto& family : nickname_families()) {
            const std::string& canonical = family.front();
            for (const auto& variant : family) {
                map[variant] = canonical;
            }
        }
        return map;
    }();

    const std::string key = to_lower_trim(name);
    const auto it = lookup.find(key);
    return it != lookup.end() ? it->second : key;
}

}  // namespace pdd
