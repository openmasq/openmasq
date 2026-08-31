#!/usr/bin/env python
"""Presidio sur le dataset adapté — configuration PAR DÉFAUT de l'AnalyzerEngine
(reconnaisseurs prédéfinis, seuil 0), comme dans le RAPPORT-presidio historique.
Les détections NRP sont écartées : les vérités NRP l'ont été côté adaptateur, les
compter en faux positifs serait déloyal. Sortie : {id_de_cas: [textes détectés]}."""
import json, sys, time
from presidio_analyzer import AnalyzerEngine

cases = json.load(open("presidio-research.benchcase.json"))
engine = AnalyzerEngine(default_score_threshold=0)
out, t0 = {}, time.time()
for i, c in enumerate(cases):
    results = engine.analyze(text=c["text"], language="en")
    out[c["id"]] = [c["text"][r.start:r.end] for r in results if r.entity_type != "NRP"]
    if i % 200 == 0:
        print(f"  {i}/{len(cases)} ({time.time()-t0:.0f}s)", file=sys.stderr)
json.dump(out, open("presidio.detections.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(cases)} cas analysés en {time.time()-t0:.0f}s -> data/presidio.detections.json")
