# Limiting Dilution Poisson Calculator

Simple browser app for limiting dilution cloning design.

## Features

- Input average cells per well (lambda)
- Calculates probabilities of:
  - 0 cells per well
  - 1 cell per well
  - 2+ cells per well
- Computes expected single-cell wells in a 96-well plate
- Estimates optimal seeding density ranges for target P(1) occupancy (default 30-40%)
- Interactive sliders and live updates
- Interactive Poisson probability chart with a live λ indicator
- Exportable occupancy table as CSV
- Experiment Planner (reverse mode) to solve λ from desired single-cell wells
- Side-by-side lambda comparison mode (metrics, chart markers, and table markers)
- 96-well plate simulation preview with re-roll
- Always-visible dilution planner for suspension concentration and pipetting setup
- Onboarding guidance and reset-to-defaults workflow

## Run

Open `index.html` in any modern browser.

## GitHub Pages

This repo is set up for GitHub Pages deployment via GitHub Actions.

To publish the site:

1. Open the repository settings on GitHub.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Push to `main` or run the workflow manually.

After the first successful deployment, GitHub will provide the live site URL.

## Notes

- Based on Poisson model: P(k) = e^(-lambda) * lambda^k / k!
- Max single-cell occupancy, P(1), is 1/e (~36.79%) at lambda = 1
- If a target above 36.79% is entered, the app reports the feasible clipped maximum
- Suspension concentration for plating volume V (uL/well): C_susp (cells/mL) = 1000 * lambda / V
