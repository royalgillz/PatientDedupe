"""Build a labelled evaluation set from the Synthea population.

Synthea gives us distinct people, so a de-duplication engine has nothing to match
out of the box. This script manufactures the duplicates: it takes a sample of real
Synthea patients, makes realistic messy copies of some of them (the kind of edits a
rushed registration clerk produces), and pairs everything up with a known label.
Because we control which copy came from which original, the labels are exact ground
truth, which is what lets us measure precision and recall honestly.

Output: data/pairs.csv with both records side by side and an is_duplicate label.

Run:  python duplicate_injector.py [--n-dupes 600] [--n-negs 1800] [--seed 7]
"""

import argparse
import csv
import os
import random
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PATIENTS = os.path.join(ROOT, "tools", "synthea", "output", "csv", "patients.csv")
OUT = os.path.join(ROOT, "data", "pairs.csv")

# A few nickname swaps so some duplicates carry the Robert/Bob style of difference.
NICKNAMES = {
    "robert": "Bob", "william": "Bill", "richard": "Rick", "james": "Jim",
    "john": "Jack", "joseph": "Joe", "charles": "Charlie", "thomas": "Tom",
    "michael": "Mike", "elizabeth": "Liz", "margaret": "Maggie", "katherine": "Kate",
    "jennifer": "Jen", "patricia": "Pat", "susan": "Sue", "deborah": "Debbie",
}
STREET_ABBR = {"Street": "St", "Avenue": "Ave", "Road": "Rd", "Drive": "Dr",
               "Lane": "Ln", "Court": "Ct", "Boulevard": "Blvd"}

FIELDS = ["first_name", "last_name", "dob", "gender", "address", "city", "zip"]


def strip_digits(s):
    # Synthea appends numbers to names and places, for example "Robert123".
    return re.sub(r"\d+", "", s).strip()


def load_patients(limit=None):
    rows = []
    with open(PATIENTS, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "first_name": strip_digits(r["FIRST"]),
                "last_name": strip_digits(r["LAST"]),
                "dob": r["BIRTHDATE"],
                "gender": r["GENDER"],
                "address": strip_digits(r["ADDRESS"]),
                "city": strip_digits(r["CITY"]),
                "zip": (r["ZIP"] or "")[:5],
            })
            if limit and len(rows) >= limit:
                break
    return rows


def typo(word):
    if len(word) < 2:
        return word
    i = random.randrange(len(word) - 1)
    chars = list(word)
    chars[i], chars[i + 1] = chars[i + 1], chars[i]  # adjacent swap
    return "".join(chars)


def swap_dob_digits(dob):
    digits_idx = [i for i, c in enumerate(dob) if c.isdigit()]
    if len(digits_idx) < 2:
        return dob
    i = random.choice(digits_idx[:-1])
    chars = list(dob)
    j = i + 1
    while j < len(dob) and not dob[j].isdigit():
        j += 1
    if j < len(dob):
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


def perturb(rec):
    """Return a messy copy of rec that is still clearly the same person."""
    out = dict(rec)
    edits = random.sample(
        ["nickname", "lastname_typo", "dob", "address", "zip", "city"],
        k=random.randint(1, 3),
    )
    for e in edits:
        if e == "nickname":
            key = out["first_name"].lower()
            if key in NICKNAMES:
                out["first_name"] = NICKNAMES[key]
            else:
                out["first_name"] = typo(out["first_name"])
        elif e == "lastname_typo":
            out["last_name"] = typo(out["last_name"])
        elif e == "dob":
            out["dob"] = swap_dob_digits(out["dob"])
        elif e == "address":
            addr = out["address"]
            for long, short in STREET_ABBR.items():
                if long in addr:
                    addr = addr.replace(long, short)
                    break
            out["address"] = addr
        elif e == "zip" and out["zip"]:
            z = list(out["zip"])
            z[-1] = str((int(z[-1]) + 1) % 10)
            out["zip"] = "".join(z)
        elif e == "city":
            out["city"] = typo(out["city"])
    return out


def row_for(a, b, label):
    row = {}
    for f in FIELDS:
        row["a_" + f] = a[f]
        row["b_" + f] = b[f]
    row["is_duplicate"] = label
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-dupes", type=int, default=600)
    ap.add_argument("--n-negs", type=int, default=1800)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    random.seed(args.seed)

    patients = load_patients()
    if len(patients) < 50:
        raise SystemExit("not enough patients found, generate the Synthea data first")

    pairs = []

    # Positive pairs: a patient and a messy copy of the same patient.
    for rec in random.sample(patients, min(args.n_dupes, len(patients))):
        pairs.append(row_for(rec, perturb(rec), 1))

    # Negative pairs: two different people. Half are made deliberately hard by
    # sharing a birth year or a last name, which is where naive matchers trip.
    by_year = {}
    for p in patients:
        by_year.setdefault(p["dob"][:4], []).append(p)

    made = 0
    attempts = 0
    while made < args.n_negs and attempts < args.n_negs * 20:
        attempts += 1
        if made % 2 == 0:
            year = random.choice(list(by_year.keys()))
            bucket = by_year[year]
            if len(bucket) < 2:
                continue
            a, b = random.sample(bucket, 2)
        else:
            a, b = random.sample(patients, 2)
        if a is b:
            continue
        pairs.append(row_for(a, b, 0))
        made += 1

    random.shuffle(pairs)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    header = [f"{side}_{f}" for f in FIELDS for side in ("a", "b")]
    header = [f"a_{f}" for f in FIELDS] + [f"b_{f}" for f in FIELDS] + ["is_duplicate"]
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(pairs)

    dupes = sum(1 for p in pairs if p["is_duplicate"] == 1)
    print(f"wrote {len(pairs)} pairs to {OUT} ({dupes} duplicates, {len(pairs) - dupes} non-duplicates)")


if __name__ == "__main__":
    main()
