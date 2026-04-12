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
- Exportable occupancy table as CSV

## Run

Open `index.html` in any modern browser.

## Notes

- Based on Poisson model: P(k) = e^(-lambda) * lambda^k / k!
- Max single-cell occupancy, P(1), is 1/e (~36.79%) at lambda = 1
- If a target above 36.79% is entered, the app reports the feasible clipped maximum
