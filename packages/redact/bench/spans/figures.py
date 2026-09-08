#!/usr/bin/env python
"""Draws `figures/` from `results/scores.json` — and from nothing else.

    python spans/figures.py            # six figures × en/fr × light/dark + figures/manifest.json

The scored summary is the ONLY input (plus `results/latency.*.json` for the response-time
figure, which is a different measurement and says so). No figure re-implements the metric:
a second scorer is how two numbers for one measurement start to exist. Run
`pnpm bench:spans --replay --json` first — the manifest records the sha256 of what was read,
so a figure can always be traced to the results that produced it.

⚠️ This script used to live outside the repository, and it was LOST. Twenty-four PNGs then
sat in `figures/` with no way to redraw them: the tables moved on, the figures did not, and
the page contradicted itself for a day. That is why it is committed here now.

Colours: the categorical palette validated for both surfaces (adjacent CVD ΔE 9.1 light /
8.4 dark, normal-vision 19.6 / 19.3). The dark column is the same six hues STEPPED for the
dark surface, not an automatic flip. Three light-mode hues sit below 3:1 contrast, which is
legal only with relief — hence the value printed on every bar.
"""
import hashlib
import json
import os
import platform
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "figures")
SCORES = os.path.join(HERE, "results", "scores.json")

# The engines, in the order every figure paints them — slot order IS the CVD-safety
# mechanism, so it is fixed here and never cycled.
ENGINES = ["patterns", "ner", "ner-strict", "pplx", "opf", "presidio"]
LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"]
DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"]
MARKERS = ["o", "s", "D", "^", "v", "P"]  # scatter: identity is never colour alone
CORPORA = ["internal", "tab", "gretel", "ai4privacy", "nemotron"]
CORPUS_LABEL = {"internal": "OpenMasq", "tab": "TAB", "gretel": "Gretel",
                "ai4privacy": "ai4privacy", "nemotron": "Nemotron"}
# PII-Tracer's own published F1, from the PII-TRACE paper — the only numbers on this page
# that were not measured here, kept beside the ones that were.
PUBLISHED = {"nemotron": 0.847, "ai4privacy": 0.950, "gretel": 0.952, "tab": 0.594}

T = {
    "en": {
        "engines": ["Rules", "Product · Renforcé", "Product · Strict", "PII-Tracer",
                    "OpenAI Privacy Filter", "Presidio"],
        "f1": "Character-level F1 per corpus — the app's categories",
        "f1y": "F1",
        "cat": "Character-level recall per app category — every corpus pooled",
        "catx": "recall",
        "pr": "Precision against recall, per corpus",
        "prx": "recall", "pry": "precision",
        "cons": "Identifiers whose every mention is found, by number of mentions",
        "consx": "mentions per identifier", "consy": "found entirely",
        "lat": "Median response time per document (whisker: p90)",
        "laty": "ms per document", "gpu": "GPU",
        "repro": "PII-Tracer: F1 measured here / F1 published",
        "measured": "measured", "published": "published",
        "optin": "off by default", "retired": "retired", "none": "no app category",
    },
    "fr": {
        "engines": ["Règles", "Produit · Renforcé", "Produit · Strict", "PII-Tracer",
                    "OpenAI Privacy Filter", "Presidio"],
        "f1": "F1 au caractère par corpus — les catégories de l'app",
        "f1y": "F1",
        "cat": "Rappel au caractère par catégorie de l'app — tous corpus confondus",
        "catx": "rappel",
        "pr": "Précision contre rappel, par corpus",
        "prx": "rappel", "pry": "précision",
        "cons": "Identifiants dont chaque mention est trouvée, par nombre de mentions",
        "consx": "mentions par identifiant", "consy": "trouvés en entier",
        "lat": "Temps de réponse médian par document (moustache : p90)",
        "laty": "ms par document", "gpu": "GPU",
        "repro": "PII-Tracer : F1 mesuré ici / F1 publié",
        "measured": "mesuré", "published": "publié",
        "optin": "éteinte par défaut", "retired": "retirée", "none": "hors catégories",
    },
}

S = json.load(open(SCORES, encoding="utf-8"))
ROWS = {(r["dataset"], r["engine"]): r for r in S["rows"]}
STAMP = None


def theme(dark):
    """Surfaces and ink per mode — the dark set is chosen, never derived by inversion."""
    if dark:
        return dict(bg="#1a1a19", ink="#f2f2ef", ink2="#b9b8b0", grid="#3a3a37", pal=DARK)
    return dict(bg="#f7f8fa", ink="#151515", ink2="#61636b", grid="#e2e4e9", pal=LIGHT)


def frame(th, w, h, title):
    fig, ax = plt.subplots(figsize=(w, h))
    fig.patch.set_facecolor(th["bg"])
    ax.set_facecolor(th["bg"])
    fig.suptitle(title, x=0.012, y=0.965, ha="left", fontsize=17, fontweight="bold",
                 color=th["ink"])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=th["ink2"], labelsize=11, length=0)
    return fig, ax


def finish(fig, ax, th, name, lang, dark, legend=None, ncol=6):
    if legend:
        ax.legend(handles=legend, loc="upper center", bbox_to_anchor=(0.5, -0.075),
                  ncol=ncol, frameon=False, fontsize=11, labelcolor=th["ink2"],
                  handlelength=1.1, columnspacing=1.6)
    fig.text(0.012, 0.022, STAMP, fontsize=9, color=th["ink2"], family="monospace")
    fig.savefig(os.path.join(OUT, f"{name}-{lang}-{'dark' if dark else 'light'}.png"),
                dpi=110, facecolor=th["bg"])
    plt.close(fig)


def grouped(ax, th, groups, series, values, fmt="{:.3f}", rotate=90):
    """One group per x tick, one bar per engine — with a 2 px surface gap between fills."""
    n = len(series)
    w = 0.82 / n
    for i, _s in enumerate(series):
        xs = [g + (i - (n - 1) / 2) * w for g in range(len(groups))]
        ys = [values[i][j] for j in range(len(groups))]
        ax.bar(xs, ys, width=w * 0.9, color=th["pal"][i], zorder=3, linewidth=0)
        for x, y in zip(xs, ys):
            if y is None:
                continue
            ax.text(x, y + 0.012, fmt.format(y), ha="center", va="bottom", rotation=rotate,
                    fontsize=8.5, color=th["ink2"])
    ax.set_xticks(range(len(groups)))
    ax.set_xticklabels(groups)
    ax.grid(axis="y", color=th["grid"], linewidth=0.9, zorder=0)
    ax.set_axisbelow(True)


def handles(th, labels):
    return [Patch(facecolor=th["pal"][i], label=lab) for i, lab in enumerate(labels)]


# ---- 1. F1 per corpus, on the app's categories -----------------------------------------
def fig_f1(lang, dark):
    th, t = theme(dark), T[lang]
    fig, ax = frame(th, 16, 8, t["f1"])
    vals = [[ROWS[(c, e)]["in"]["f1"] for c in CORPORA] for e in ENGINES]
    grouped(ax, th, [CORPUS_LABEL[c] for c in CORPORA], ENGINES, vals)
    ax.set_ylim(0, 1.08)
    ax.set_ylabel(t["f1y"], color=th["ink2"], fontsize=12)
    fig.subplots_adjust(left=0.055, right=0.99, top=0.86, bottom=0.17)
    finish(fig, ax, th, "f1-by-corpus", lang, dark, handles(th, t["engines"]))


# ---- 2. recall per app category, pooled over the corpora --------------------------------
def fig_category(lang, dark):
    th, t = theme(dark), T[lang]
    pooled, gold = {}, {}
    for (ds, eng), r in ROWS.items():
        for cat, v in r.get("byCat", {}).items():
            pooled.setdefault(cat, {}).setdefault(eng, [0.0, 0])
            pooled[cat][eng][0] += v["charRecall"] * v["goldChars"]
            pooled[cat][eng][1] += v["goldChars"]
            if eng == "patterns":
                gold[cat] = gold.get(cat, 0) + v["goldChars"]
    cats = sorted(gold, key=lambda c: -gold[c])
    # No number on every bar here: 126 of them would collide, and the exact values are in the
    # tables at the end of the page — which is the table view the contrast rule asks for.
    height = 0.95 * len(cats) + 3.0
    fig, ax = frame(th, 15, height, t["cat"])
    n = len(ENGINES)
    h = 0.86 / n
    for i, e in enumerate(ENGINES):
        ys = [len(cats) - 1 - j - (i - (n - 1) / 2) * h for j in range(len(cats))]
        xs = [pooled[c][e][0] / pooled[c][e][1] if pooled[c][e][1] else 0 for c in cats]
        ax.barh(ys, xs, height=h * 0.86, color=th["pal"][i], zorder=3, linewidth=0)
    ax.set_yticks([len(cats) - 1 - j for j in range(len(cats))])
    ax.set_yticklabels([f"{c}  ({gold[c] // 1000} k)" if gold[c] >= 1000 else f"{c}  ({gold[c]})"
                        for c in cats], fontsize=11.5)
    ax.set_ylim(-0.6, len(cats) - 0.4)
    ax.set_xlim(0, 1.0)
    ax.set_xlabel(t["catx"], color=th["ink2"], fontsize=12)
    ax.grid(axis="x", color=th["grid"], linewidth=0.9, zorder=0)
    ax.set_axisbelow(True)
    # The legend sits UNDER the title on this one: at the foot it would land on the stamp.
    ax.legend(handles=handles(th, t["engines"]), loc="lower center",
              bbox_to_anchor=(0.5, 1.005), ncol=6, frameon=False, fontsize=11,
              labelcolor=th["ink2"], handlelength=1.1, columnspacing=1.6)
    fig.subplots_adjust(left=0.165, right=0.99, top=1 - 2.0 / height, bottom=1.1 / height)
    finish(fig, ax, th, "recall-by-category", lang, dark)


# ---- 3. precision against recall ---------------------------------------------------------
def fig_pr(lang, dark):
    th, t = theme(dark), T[lang]
    fig, axes = plt.subplots(1, len(CORPORA), figsize=(17, 4.6), sharey=True)
    fig.patch.set_facecolor(th["bg"])
    fig.suptitle(t["pr"], x=0.012, y=0.965, ha="left", fontsize=17, fontweight="bold",
                 color=th["ink"])
    for ax, c in zip(axes, CORPORA):
        ax.set_facecolor(th["bg"])
        for s in ax.spines.values():
            s.set_visible(False)
        for f in (0.4, 0.6, 0.8, 0.9):  # iso-F1
            xs = [x / 100 for x in range(int(f * 100) + 1, 101)]
            ax.plot(xs, [f * x / (2 * x - f) for x in xs], color=th["grid"], linewidth=1,
                    zorder=1)
        for i, e in enumerate(ENGINES):
            r = ROWS[(c, e)]["in"]
            ax.scatter([r["r"]], [r["p"]], s=95, marker=MARKERS[i], color=th["pal"][i],
                       zorder=3, linewidths=0)
        ax.set_title(CORPUS_LABEL[c], color=th["ink2"], fontsize=12, pad=8)
        ax.set_xlim(0, 1.02)
        ax.set_ylim(0, 1.02)
        ax.tick_params(colors=th["ink2"], labelsize=10, length=0)
        ax.grid(color=th["grid"], linewidth=0.7, zorder=0)
        ax.set_axisbelow(True)
        ax.set_xlabel(t["prx"], color=th["ink2"], fontsize=11)
    axes[0].set_ylabel(t["pry"], color=th["ink2"], fontsize=11)
    marks = [plt.Line2D([], [], marker=MARKERS[i], color=th["pal"][i], linestyle="",
                        markersize=9, label=lab) for i, lab in enumerate(t["engines"])]
    axes[len(CORPORA) // 2].legend(handles=marks, loc="upper center",
                                   bbox_to_anchor=(0.5, -0.16), ncol=6, frameon=False,
                                   fontsize=11, labelcolor=th["ink2"])
    fig.subplots_adjust(left=0.045, right=0.99, top=0.83, bottom=0.24, wspace=0.22)
    finish(fig, axes[0], th, "precision-recall", lang, dark)


# ---- 4. every mention, as repetition grows ----------------------------------------------
def fig_consistency(lang, dark):
    th, t = theme(dark), T[lang]
    buckets = ["1", "2", "3–5", "6–10", "11+"]
    vals = []
    for e in ENGINES:
        row = []
        for b in buckets:
            ok = n = 0
            for c in CORPORA:
                x = ROWS[(c, e)]["consistency"]["buckets"].get(b)
                if x:
                    ok += x["ok"]
                    n += x["n"]
            row.append(ok / n if n else 0)
        vals.append(row)
    fig, ax = frame(th, 14, 7.4, t["cons"])
    counts = []
    for b in buckets:
        n = sum((ROWS[(c, "patterns")]["consistency"]["buckets"].get(b) or {"n": 0})["n"]
                for c in CORPORA)
        counts.append(f"{b}\n({n})")
    grouped(ax, th, counts, ENGINES, vals, fmt="{:.0%}", rotate=0)
    ax.set_ylim(0, 1.12)
    ax.set_ylabel(t["consy"], color=th["ink2"], fontsize=12)
    fig.subplots_adjust(left=0.06, right=0.99, top=0.86, bottom=0.19)
    finish(fig, ax, th, "consistency", lang, dark, handles(th, t["engines"]))


# ---- 5. response time — a DIFFERENT measurement, from the quiet pass ---------------------
def fig_latency(lang, dark):
    """`latency.*.json`: one engine at a time, nothing else running. NOT the per-case timings
    of the accuracy pass, which runs engines side by side for hours.

    ⚠️ LINEAR, one panel per corpus. A single axis spanning 4 ms to 3.3 s asks for a log
    scale, and a log scale on BARS is a lie: a bar encodes its magnitude by its length from
    zero, and the log breaks that — twice the ink stops meaning twice the wait. The corpora
    are faceted instead, each panel on its own linear axis, with the value printed on every
    bar so the panels can be compared across their different scales.
    """
    th, t = theme(dark), T[lang]
    ms, gpu = {}, {}
    for f, is_gpu in [("latency.node.json", False), ("latency.presidio.json", False),
                      ("latency.pplx.cpu.json", False), ("latency.pplx.mps.json", True)]:
        p = os.path.join(HERE, "results", f)
        if not os.path.exists(p):
            continue
        for r in json.load(open(p, encoding="utf-8"))["rows"]:
            (gpu if is_gpu else ms)[(r["dataset"], r["engine"])] = (r["median"], r["p90"])
    if not ms:
        return
    fig, axes = plt.subplots(1, len(CORPORA), figsize=(17, 5.4))
    fig.patch.set_facecolor(th["bg"])
    fig.suptitle(t["lat"], x=0.012, y=0.955, ha="left", fontsize=17, fontweight="bold",
                 color=th["ink"])
    fmt = lambda v: f"{v/1000:.1f} s" if v >= 1000 else f"{v:.0f}"
    for ax, c in zip(axes, CORPORA):
        ax.set_facecolor(th["bg"])
        for sp in ax.spines.values():
            sp.set_visible(False)
        top = 0
        for i, e in enumerate(ENGINES):
            v = ms.get((c, e))
            if not v:
                continue
            ax.bar([i], [v[0]], width=0.74, color=th["pal"][i], zorder=3, linewidth=0)
            ax.errorbar([i], [v[0]], yerr=[[0], [max(0.0, v[1] - v[0])]], fmt="none",
                        ecolor=th["ink2"], elinewidth=1.1, capsize=3, zorder=4)
            ax.text(i, v[1] if v[1] > v[0] else v[0], f" {fmt(v[0])}", ha="center",
                    va="bottom", fontsize=9, color=th["ink2"], rotation=90)
            top = max(top, v[1])
            g = gpu.get((c, e))
            if g:
                ax.bar([i + 0.28], [g[0]], width=0.34, color=th["bg"],
                       edgecolor=th["pal"][i], hatch="////", linewidth=1.1, zorder=3)
                top = max(top, g[0])
        ax.set_title(f"{CORPUS_LABEL[c]}", color=th["ink2"], fontsize=12, pad=8)
        ax.set_ylim(0, top * 1.42 or 1)
        ax.set_xlim(-0.7, len(ENGINES) - 0.3)
        ax.set_xticks([])
        ax.tick_params(colors=th["ink2"], labelsize=10, length=0)
        ax.grid(axis="y", color=th["grid"], linewidth=0.8, zorder=0)
        ax.set_axisbelow(True)
    axes[0].set_ylabel(t["laty"], color=th["ink2"], fontsize=11)
    present = [i for i, e in enumerate(ENGINES) if any((c, e) in ms for c in CORPORA)]
    legend = [Patch(facecolor=th["pal"][i], label=t["engines"][i]) for i in present]
    legend.append(Patch(facecolor=th["bg"], edgecolor=th["ink2"], hatch="////", label=t["gpu"]))
    axes[len(CORPORA) // 2].legend(handles=legend, loc="upper center",
                                   bbox_to_anchor=(0.5, -0.06), ncol=len(legend),
                                   frameon=False, fontsize=11, labelcolor=th["ink2"],
                                   handlelength=1.1, columnspacing=1.6)
    fig.subplots_adjust(left=0.05, right=0.99, top=0.82, bottom=0.17, wspace=0.28)
    finish(fig, axes[0], th, "latency", lang, dark)


# ---- 6. measured here against published --------------------------------------------------
def fig_repro(lang, dark):
    th, t = theme(dark), T[lang]
    order = ["nemotron", "ai4privacy", "gretel", "tab"]
    fig, ax = frame(th, 15, 5.2, t["repro"])
    for j, c in enumerate(order):
        y = len(order) - 1 - j
        mine = ROWS[(c, "pplx")]["all"]["f1"]
        ax.barh([y + 0.19], [mine], height=0.32, color=th["pal"][3], zorder=3, linewidth=0)
        ax.barh([y - 0.19], [PUBLISHED[c]], height=0.32, color=th["grid"], zorder=3,
                linewidth=0)
        ax.text(mine + 0.008, y + 0.19, f"{mine:.3f}", va="center", fontsize=11,
                color=th["ink"])
        ax.text(PUBLISHED[c] + 0.008, y - 0.19, f"{PUBLISHED[c]:.3f}", va="center",
                fontsize=11, color=th["ink2"])
    ax.set_yticks([len(order) - 1 - j for j in range(len(order))])
    ax.set_yticklabels([CORPUS_LABEL[c] for c in order], fontsize=12)
    ax.set_xlim(0, 1.06)
    ax.grid(axis="x", color=th["grid"], linewidth=0.9, zorder=0)  # the title names the measure
    ax.set_axisbelow(True)
    fig.subplots_adjust(left=0.09, right=0.99, top=0.84, bottom=0.24)
    finish(fig, ax, th, "reproduction", lang, dark,
           [Patch(facecolor=th["pal"][3], label=t["measured"]),
            Patch(facecolor=th["grid"], label=t["published"])], 2)


def main():
    global STAMP
    version = json.load(open(os.path.join(HERE, "../../package.json"), encoding="utf-8"))["version"]
    commit, dirty = "unknown", ""
    try:
        import subprocess
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE,
                                capture_output=True, text=True).stdout.strip() or commit
        changed = subprocess.run(["git", "status", "--porcelain", "--",
                                  "packages/redact/src", "packages/catalog/src"],
                                 cwd=os.path.join(HERE, "../../../.."),
                                 capture_output=True, text=True).stdout.strip()
        dirty = "+dirty" if changed else ""
    except Exception:  # not a checkout: the figure still names its scorer and date
        pass
    STAMP = (f"@openmasq/redact {version} · {commit}{dirty} · {S['measured']} · {S['scorer']}")
    drawn = []
    for lang in ("en", "fr"):
        for dark in (False, True):
            for f in (fig_f1, fig_category, fig_pr, fig_consistency, fig_latency, fig_repro):
                f(lang, dark)
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            drawn.append(f)
    inputs = {}
    for f in sorted(os.listdir(os.path.join(HERE, "results"))):
        p = os.path.join(HERE, "results", f)
        if f.endswith(".json"):
            inputs[f] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    json.dump({
        "redactVersion": version, "commit": commit, "engineTreeDirty": bool(dirty),
        "measured": S["measured"], "figuresGenerated": __import__("datetime").date.today().isoformat(),
        "scorer": S["scorer"], "languages": ["en", "fr"], "themes": ["dark", "light"],
        "matplotlib": matplotlib.__version__, "python": platform.python_version(),
        "drawnBy": "spans/figures.py", "figures": drawn, "inputs": inputs,
    }, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), indent=1)
    print(f"{len(drawn)} figures → {os.path.relpath(OUT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
