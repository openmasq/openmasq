/**
 * File paths as a user's machine names them — the corpus `pathNames.test.ts` measures.
 *
 * EVERY value is INVENTED (personas, companies, usernames, case numbers): none is somebody's.
 * `sensitive` lists the spans that identify someone, spelled as the PATH spells them; anything
 * else in the path (folder words, document types, counters, dates, months, public bodies,
 * notorious brands) is the MEANING a model needs and should keep.
 */
export interface PathCase {
  path: string;
  sensitive: string[];
}

export const PATH_CORPUS: PathCase[] = [
  // ── US legal practice ──
  { path: "/Users/mkowalczyk/Documents/Client Files/Brightwater Logistics LLC/Engagement Letter.docx", sensitive: ["mkowalczyk", "Brightwater"] },
  { path: "/Users/mkowalczyk/Documents/Litigation/Harlan v. Whitcombe/Deposition of Ellen Prusik 2026-03-04.pdf", sensitive: ["mkowalczyk", "Harlan", "Whitcombe", "Ellen Prusik"] },
  { path: "C:\\Users\\dfairbanks\\OneDrive\\Clients\\Tessaro Holdings\\Board Minutes March 2025.docx", sensitive: ["dfairbanks", "Tessaro"] },
  { path: "/Users/pnakamura/Documents/Estate of Rosalind Pemberton/Last Will and Testament.pdf", sensitive: ["pnakamura", "Rosalind Pemberton"] },
  { path: "/Users/ahollis/Dropbox/Matters/2025-0147 Delgarno Custody/Petition for Custody.pdf", sensitive: ["ahollis", "Delgarno"] },
  { path: "/Users/rvance/Clients/Pellwood Industries/Discovery/Interrogatories Set One.docx", sensitive: ["rvance", "Pellwood"] },
  { path: "/Users/rvance/Clients/Pellwood Industries/Settlement Agreement draft v2.docx", sensitive: ["rvance", "Pellwood"] },
  { path: "/Users/oadeyemi/Documents/Contracts/Master Services Agreement - Quillfeather Analytics.pdf", sensitive: ["oadeyemi", "Quillfeather"] },
  { path: "/Users/cvasquez/Documents/Cases/People v. Tremaine Hollister/Motion to Suppress.docx", sensitive: ["cvasquez", "Tremaine Hollister"] },
  { path: "/Users/cvasquez/Documents/Cases/Hollister Hearing Transcript 2026-05-20.pdf", sensitive: ["cvasquez", "Hollister"] },
  { path: "/Users/dkessler/Documents/Matters/Ashworth Corp acquisition/Due Diligence Memo.docx", sensitive: ["dkessler", "Ashworth"] },
  { path: "/Users/dkessler/Documents/Matters/Ashworth Corp acquisition/Board Resolution signed.pdf", sensitive: ["dkessler", "Ashworth"] },
  { path: "/Users/aweiss/Documents/Clients/Marlow & Finchley/Retainer Agreement.pdf", sensitive: ["aweiss", "Marlow", "Finchley"] },
  { path: "/Users/aweissmann/Documents/Personal/Divorce Decree - Brannagh v. Brannagh.pdf", sensitive: ["aweissmann", "Brannagh"] },
  { path: "/Users/hwestbrook/Documents/Thornquist Family Trust/Trust Amendment 2025.pdf", sensitive: ["hwestbrook", "Thornquist"] },
  { path: "C:\\Users\\Owner\\Documents\\Medical Records\\Lab Results Dr. Petrakos.pdf", sensitive: ["Petrakos"] },
  { path: "C:\\Users\\Admin\\Documents\\HR\\Termination Letter - Gregory Haldane.docx", sensitive: ["Gregory Haldane"] },
  { path: "/Users/egrant/Documents/Immigration/Passport Scan - Amara Okonkwe.pdf", sensitive: ["egrant", "Amara Okonkwe"] },
  { path: "/Users/egrant/Documents/Immigration/Visa Application Amara Okonkwe (2).pdf", sensitive: ["egrant", "Amara Okonkwe"] },
  { path: "C:\\Users\\Nadia\\Documents\\Taxes\\2024 W-2 Halvorsen Dental.pdf", sensitive: ["Nadia", "Halvorsen"] },
  { path: "C:\\Users\\jpark\\Desktop\\Invoices\\Invoice_Ravenscroft_Media_2025-09.pdf", sensitive: ["jpark", "Ravenscroft"] },
  { path: "/Users/oadeyemi/Documents/Contracts/Quillfeather SOW 3.pdf", sensitive: ["oadeyemi", "Quillfeather"] },
  // ── Everyday US files ──
  { path: "/home/rquintero/scans/Scan 2026-01-15 Invoice 4471.pdf", sensitive: ["rquintero"] },
  { path: "/Users/tobrien/Pictures/IMG_4821.HEIC", sensitive: ["tobrien"] },
  { path: "/Users/tobrien/Desktop/Screenshot 2026-02-11 at 10.42.17.png", sensitive: ["tobrien"] },
  { path: "/home/ksato/projects/payroll-export/Quarterly Report Q3.xlsx", sensitive: ["ksato"] },
  { path: "/home/bnovak/Documents/receipts/receipt_amazon_2025-12-03.pdf", sensitive: ["bnovak"] },
  // ── French practice and household ──
  { path: "/Users/jdelacroix/Downloads/Facture Ostrander Conseil 2024-11.pdf", sensitive: ["jdelacroix", "Ostrander"] },
  { path: "/Users/jdelacroix/Downloads/Bulletin de salaire Octobre 2025 - Margaux Vellerin.pdf", sensitive: ["jdelacroix", "Margaux Vellerin"] },
  { path: "/Users/claire.monfort/Documents/Contrats/Contrat de bail - Lucien Ferragne.pdf", sensitive: ["claire.monfort", "Lucien Ferragne"] },
  { path: "~/Desktop/Photos/Anniversaire Théo Brassanne.jpg", sensitive: ["Théo Brassanne"] },
  { path: "/Users/lmercier/Documents/Greffe/Facture du Greffe du tribunal des activités économiques de Lyon.pdf", sensitive: ["lmercier"] },
  { path: "/Users/lmercier/Documents/Societe/001 Dépôt des comptes annuels sur Corvane Studio 2022B48213 774019362-1.pdf", sensitive: ["lmercier", "Corvane", "2022B48213", "774019362"] },
  { path: "/Users/mlaurent-roy/Documents/Médical/Compte rendu IRM Juliette Sarrazac.pdf", sensitive: ["mlaurent-roy", "Juliette Sarrazac"] },
  { path: "/Users/fbenali/Downloads/Relevé de compte Janvier 2026.pdf", sensitive: ["fbenali"] },
  { path: "/Users/gmorel/Documents/Clients/Boulangerie Fournial/Devis 2025-118.pdf", sensitive: ["gmorel", "Fournial"] },
  { path: "/Users/gmorel/Documents/Clients/Boulangerie Fournial/Kbis Boulangerie Fournial.pdf", sensitive: ["gmorel", "Fournial"] },
  { path: "/Users/ytremblay/Documents/Scans/CNI Yasmine Trembleau recto.jpg", sensitive: ["ytremblay", "Yasmine Trembleau"] },
  { path: "/Users/ytremblay/Documents/Banque/RIB Crédit Agricole.pdf", sensitive: ["ytremblay"] },
  { path: "/Users/nrichter-ould/Documents/Paie/Attestation employeur Kévin Lambrechts.pdf", sensitive: ["nrichter-ould", "Kévin Lambrechts"] },
  { path: "/Users/sfontaine/Documents/Projets/projet-alpha-v2/notes.md", sensitive: ["sfontaine"] },
  { path: "/Users/sfontaine/Documents/Projets/Rénovation cuisine Dumoulard/Plan cuisine.pdf", sensitive: ["sfontaine", "Dumoulard"] },
  { path: "/Users/tmoreau/Documents/Comptabilité/Grand livre 2024 SARL Vendrance.xlsx", sensitive: ["tmoreau", "Vendrance"] },
  { path: "/Users/tmoreau/Downloads/Facture-EDF-2025-03.pdf", sensitive: ["tmoreau"] },
  { path: "/Users/Julien/Documents/Scans/Facture_Kervadec_Menuiserie_2025.pdf", sensitive: ["Julien", "Kervadec"] },
];
