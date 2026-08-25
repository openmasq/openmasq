//! Injecte les identifiants de marque À LA COMPILATION — la marque n'a qu'une seule
//! maison (`packages/branding/branding.json`, règle 9), et un binaire Rust ne peut pas
//! la lire à l'exécution sans embarquer un parseur. On extrait donc `name` et `slug`
//! ici, sans dépendance (le JSON est plat et à nous ; un champ introuvable CASSE la
//! compilation au lieu de produire un binaire mal étiqueté).

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
