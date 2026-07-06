# Limiting Dilution Poisson Calculator

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21218201.svg)](https://doi.org/10.5281/zenodo.21218201)

A free, static, client-side web app for designing limiting-dilution cloning experiments. Enter an average number of cells per well (lambda) and it reports the Poisson probabilities of empty, single-cell, and multi-cell wells, recommends lambda ranges for a target single-cell occupancy, plans experiments in reverse (solving lambda from a desired number of monoclonal wells), and converts lambda into a practical seeding density and pipetting scheme. Everything runs in the browser — no server, no build step, no tracking.

**Live site:** https://mohammaddeen.github.io/Poisson-Calculator-for-Limiting-Dilution/

<!-- TODO: add a screenshot. Save one as docs/screenshot.png (or similar) and update the path below. -->
![Screenshot of the calculator](TODO-screenshot-path)

## Features

- Forward calculator: P(0), P(1), P(2+) and expected single-cell wells per 96-well plate
- Recommended lambda ranges for a target P(1) band (default 30–40%)
- Interactive Poisson probability chart with live lambda markers
- Exportable occupancy table (CSV)
- Experiment Planner (reverse mode): solve lambda from a desired number of single-cell wells
- Side-by-side lambda comparison (metrics, chart markers, table markers)
- 96-well plate simulation preview with re-roll
- Dilution Planner: suspension concentration and pipetting volumes, with the assumed plating volume shown inline
- Shareable links: the key inputs are encoded in the URL; a "Copy shareable link" button reproduces the exact state
- Print stylesheet for taping the dilution plan by the hood
- [Methods & Maths](methods.html) and [About](about.html) pages

## Run locally

This is a static site with no build step. Just open `index.html` in any modern browser.

For features that rely on relative URLs (shareable links resolve fine either way), you can optionally serve it over HTTP:

```
python -m http.server 8000
# then open http://localhost:8000
```

## The math

The full derivations live on the [Methods & Maths](methods.html) page. In brief:

- Poisson PMF: `P(k) = λ^k · e^(-λ) / k!`
- `P(0) = e^(-λ)`, `P(1) = λ·e^(-λ)`, `P(2+) = 1 − P(0) − P(1)`
- Max P(1) is `1/e ≈ 36.79%` at `λ = 1`; targets above this are clipped to the feasible maximum
- Reverse solve: given `s` desired single-cell wells out of `N`, solve `λ·e^(-λ) = s/N` for the low root `0 < λ < 1`
- Seeding density: `C_susp (cells/mL) = 1000·λ / V(µL/well)` — the plating volume `V` drives this number

## Deploy (GitHub Pages)

This repo is set up for GitHub Pages via GitHub Actions:

1. Open the repository settings on GitHub.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` (or run the workflow manually).

## Citation

If you use this tool in published work, please cite it via its Zenodo DOI:

> Hayatu, M. D. *Limiting Dilution Poisson Calculator*. Zenodo. https://doi.org/10.5281/zenodo.21218201

DOI: [10.5281/zenodo.21218201](https://doi.org/10.5281/zenodo.21218201) (this is the concept DOI and always resolves to the latest version).

## License

See [LICENSE](LICENSE).
