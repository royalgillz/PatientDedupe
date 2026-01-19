"""Pure-Python baseline matcher.

This mirrors the C++ engine closely enough to be a fair speed comparison: the same
metrics, the same field weights, the same kind of work per pair. It exists only so
the C++ number has something honest to be measured against. It is not the product.

Run:  python baseline.py [num_pairs]
"""

import sys
import time

WEIGHTS = {
    "last_name": 0.24,
    "first_name": 0.20,
    "dob": 0.30,
    "address": 0.10,
    "city": 0.06,
    "zip": 0.06,
    "gender": 0.04,
}


def levenshtein(a, b):
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def jaro(a, b):
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    window = max(0, max(len(a), len(b)) // 2 - 1)
    a_match = [False] * len(a)
    b_match = [False] * len(b)
    matches = 0
    for i, ca in enumerate(a):
        lo = max(0, i - window)
        hi = min(i + window + 1, len(b))
        for j in range(lo, hi):
            if b_match[j] or b[j] != ca:
                continue
            a_match[i] = b_match[j] = True
            matches += 1
            break
    if matches == 0:
        return 0.0
    transpositions = 0
    k = 0
    for i in range(len(a)):
        if not a_match[i]:
            continue
        while not b_match[k]:
            k += 1
        if a[i] != b[k]:
            transpositions += 1
        k += 1
    transpositions /= 2
    m = matches
    return ((m / len(a)) + (m / len(b)) + ((m - transpositions) / m)) / 3.0


def jaro_winkler(a, b, scale=0.1, max_prefix=4):
    j = jaro(a, b)
    if j <= 0:
        return 0.0
    prefix = 0
    for i in range(min(max_prefix, len(a), len(b))):
        if a[i] != b[i]:
            break
        prefix += 1
    return j + prefix * scale * (1.0 - j)


def lev_similarity(a, b):
    if not a and not b:
        return 1.0
    longest = max(len(a), len(b))
    return 1.0 - levenshtein(a, b) / longest


def digits(s):
    return "".join(c for c in s if c.isdigit())


def match_score(a, b):
    sims = {
        "last_name": jaro_winkler(a["last_name"].lower(), b["last_name"].lower()),
        "first_name": jaro_winkler(a["first_name"].lower(), b["first_name"].lower()),
        "address": lev_similarity(a["address"].lower(), b["address"].lower()),
        "city": jaro_winkler(a["city"].lower(), b["city"].lower()),
        "gender": 1.0 if a["gender"][:1].lower() == b["gender"][:1].lower() else 0.0,
    }
    da, db = digits(a["dob"]), digits(b["dob"])
    sims["dob"] = 1.0 if da == db else max(0.0, 1.0 - levenshtein(da, db) / max(len(da), len(db)))
    za, zb = digits(a["zip"])[:5], digits(b["zip"])[:5]
    sims["zip"] = 1.0 if za == zb else 0.0
    total = sum(WEIGHTS[k] * sims[k] for k in WEIGHTS)
    return total / sum(WEIGHTS.values())


def build_pool(n):
    firsts = ["Robert", "Bob", "Mary", "Maria", "David", "Sarah", "James", "Jim", "Patricia", "Pat"]
    lasts = ["Smith", "Jones", "Nguyen", "Patel", "Garcia", "Williams", "OBrien", "Lee", "Chen", "Khan"]
    cities = ["Boston", "Lynn", "Quincy", "Salem", "Newton"]
    pool = []
    for i in range(n):
        pool.append({
            "first_name": firsts[i % 10],
            "last_name": lasts[(i // 3) % 10],
            "dob": f"{1950 + i % 60:04d}-{1 + i % 12:02d}-{1 + i % 28:02d}",
            "gender": "M" if i % 2 else "F",
            "address": f"{10 + i % 900} Oak Street",
            "city": cities[i % 5],
            "zip": str(1000 + i % 90000),
        })
    return pool


def main():
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 200_000
    pool = build_pool(2000)
    n = len(pool)
    sink = 0.0
    start = time.perf_counter()
    for i in range(target):
        sink += match_score(pool[i % n], pool[(i * 7 + 1) % n])
    elapsed = time.perf_counter() - start
    print(f"python baseline: scored {target} pairs in {elapsed:.3f} s = {target / elapsed:,.0f} pairs/sec")
    print(f"(checksum {sink:.3f})")


if __name__ == "__main__":
    main()
