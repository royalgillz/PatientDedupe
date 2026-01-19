#pragma once

#include <string>

namespace pdd {

// Maps a given name to a canonical form so that common nicknames collapse to the
// same key. For example "bob", "rob", and "robert" all return "robert". Names we
// do not know about are returned unchanged (lowercased). This is what lets the
// matcher treat "Bob Smith" and "Robert Smith" as the same first name, which is
// the exact failure mode this whole project is built around.
std::string canonical_given_name(const std::string& name);

}  // namespace pdd
