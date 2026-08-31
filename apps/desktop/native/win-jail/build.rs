//! Injects the brand identifiers AT COMPILE TIME — the brand has exactly one home
//! (`packages/branding/branding.json`, rule 9), and a Rust binary cannot read it at
//! runtime without embedding a parser. So `name` and `slug` are extracted here, with no
//! dependency (the JSON is flat and ours; a missing field BREAKS the build rather than
//! producing a mislabelled binary).

use std::fs;
use std::path::Path;

fn field(json: &str, key: &str) -> String {
    let needle = format!("\"{key}\"");
    let at = json.find(&needle).unwrap_or_else(|| panic!("branding.json: champ `{key}` introuvable"));
    let rest = &json[at + needle.len()..];
    let colon = rest.find(':').expect("branding.json: `:` attendu");
    let rest = &rest[colon + 1..];
    let open = rest.find('"').expect("branding.json: valeur chaîne attendue");
    let rest = &rest[open + 1..];
    let close = rest.find('"').expect("branding.json: guillemet fermant attendu");
    rest[..close].to_string()
}

fn main() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../packages/branding/branding.json");
    println!("cargo:rerun-if-changed={}", path.display());
    let json = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("lecture de {} impossible : {e}", path.display()));
    println!("cargo:rustc-env=BRAND_NAME={}", field(&json, "name"));
    println!("cargo:rustc-env=BRAND_SLUG={}", field(&json, "slug"));
}
