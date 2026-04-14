const PLATE_SIZE = 96;
const MAX_SINGLE_PROB = 1 / Math.E;
const ROWS = 8;
const COLS = 12;

const DEFAULTS = {
  lambda: 0.7,
  compareEnabled: false,
  compareLambda: 1.0,
  targetMinPercent: 30,
  targetMaxPercent: 40,
  tableMaxLambda: 3,
  totalWells: "192",
  customWells: 192,
  desiredSingles: 30,
  stockConc: 400000,
  platingVolumeUl: 100,
  finalPrepVolumeMl: 10
};

const elements = {
  lambdaSlider: document.getElementById("lambdaSlider"),
  lambdaNumber: document.getElementById("lambdaNumber"),
  compareLambdaInput: document.getElementById("compareLambdaInput"),
  enableCompare: document.getElementById("enableCompare"),

  targetMinSlider: document.getElementById("targetMinSlider"),
  targetMaxSlider: document.getElementById("targetMaxSlider"),
  tableMaxLambdaSlider: document.getElementById("tableMaxLambdaSlider"),
  targetMinValue: document.getElementById("targetMinValue"),
  targetMaxValue: document.getElementById("targetMaxValue"),
  tableMaxLambdaValue: document.getElementById("tableMaxLambdaValue"),

  lambdaError: document.getElementById("lambdaError"),
  targetError: document.getElementById("targetError"),
  compareError: document.getElementById("compareError"),
  plannerError: document.getElementById("plannerError"),
  dilutionInputError: document.getElementById("dilutionInputError"),

  p0Value: document.getElementById("p0Value"),
  p1Value: document.getElementById("p1Value"),
  p2PlusValue: document.getElementById("p2PlusValue"),
  singleWells96Value: document.getElementById("singleWells96Value"),
  optimumAdvice: document.getElementById("optimumAdvice"),

  primarySummary: document.getElementById("primarySummary"),
  compareSummary: document.getElementById("compareSummary"),
  primaryDilutionSummary: document.getElementById("primaryDilutionSummary"),
  compareDilutionSummary: document.getElementById("compareDilutionSummary"),
  compareCard: document.getElementById("compareCard"),

  resultsTableBody: document.querySelector("#resultsTable tbody"),
  exportButton: document.getElementById("exportButton"),

  stockConcInput: document.getElementById("stockConcInput"),
  platingVolumeInput: document.getElementById("platingVolumeInput"),
  finalPrepVolumeInput: document.getElementById("finalPrepVolumeInput"),
  requiredCsuspValue: document.getElementById("requiredCsuspValue"),
  dilutionFactorValue: document.getElementById("dilutionFactorValue"),
  stockVolumeValue: document.getElementById("stockVolumeValue"),
  mediumVolumeValue: document.getElementById("mediumVolumeValue"),
  dilutionAdvice: document.getElementById("dilutionAdvice"),

  poissonChartCanvas: document.getElementById("poissonChart"),

  totalWellsSelect: document.getElementById("totalWellsSelect"),
  customWellsInput: document.getElementById("customWellsInput"),
  desiredClonesInput: document.getElementById("desiredClonesInput"),
  plannerLambdaValue: document.getElementById("plannerLambdaValue"),
  plannerEmptyValue: document.getElementById("plannerEmptyValue"),
  plannerMultiValue: document.getElementById("plannerMultiValue"),
  plannerCsuspValue: document.getElementById("plannerCsuspValue"),
  plannerAdvice: document.getElementById("plannerAdvice"),
  usePlannerLambdaButton: document.getElementById("usePlannerLambdaButton"),

  plateGrid: document.getElementById("plateGrid"),
  plateSummary: document.getElementById("plateSummary"),
  rerollPlateButton: document.getElementById("rerollPlateButton"),

  resetDefaultsButton: document.getElementById("resetDefaultsButton")
};

let poissonChart;
let latestPlannerLambda = null;

function poissonProbabilities(lambda) {
  const p0 = Math.exp(-lambda);
  const p1 = lambda * p0;
  const p2Plus = Math.max(0, 1 - p0 - p1);
  return { p0, p1, p2Plus };
}

function poissonRandom(lambda) {
  const limit = Math.exp(-lambda);
  let p = 1;
  let k = 0;
  do {
    k += 1;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

function formatPercent(probability, digits = 2) {
  return `${(probability * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function solveLambdaForTargetSingle(targetProb) {
  if (targetProb < 0 || targetProb > MAX_SINGLE_PROB) {
    return [];
  }
  const f = (lambda) => lambda * Math.exp(-lambda) - targetProb;
  const bisect = (a, b) => {
    let left = a;
    let right = b;
    for (let i = 0; i < 70; i += 1) {
      const mid = (left + right) / 2;
      const fm = f(mid);
      const fl = f(left);
      if (Math.abs(fm) < 1e-12) {
        return mid;
      }
      if (fl * fm <= 0) {
        right = mid;
      } else {
        left = mid;
      }
    }
    return (left + right) / 2;
  };
  const lowRoot = bisect(1e-9, 1);
  const highRoot = targetProb === MAX_SINGLE_PROB ? 1 : bisect(1, 20);
  return [lowRoot, highRoot];
}

function solveLowLambdaForDesiredSingles(totalWells, desiredSingles) {
  if (desiredSingles < 0) {
    return null;
  }
  if (desiredSingles === 0) {
    return 0;
  }
  const targetProb = desiredSingles / totalWells;
  if (targetProb > MAX_SINGLE_PROB) {
    return null;
  }
  const f = (lambda) => lambda * Math.exp(-lambda) - targetProb;
  let left = 1e-9;
  let right = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (left + right) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-12) {
      return mid;
    }
    if (f(left) * fm <= 0) {
      right = mid;
    } else {
      left = mid;
    }
  }
  return (left + right) / 2;
}

function clearErrors() {
  elements.lambdaError.textContent = "";
  elements.targetError.textContent = "";
  elements.compareError.textContent = "";
  elements.plannerError.textContent = "";
  elements.dilutionInputError.textContent = "";
}

function getState() {
  const lambda = parseFloat(elements.lambdaNumber.value);
  const compareLambda = parseFloat(elements.compareLambdaInput.value);
  const targetMinPercent = parseFloat(elements.targetMinSlider.value);
  const targetMaxPercent = parseFloat(elements.targetMaxSlider.value);
  const tableMaxLambda = parseFloat(elements.tableMaxLambdaSlider.value);
  const stockConc = parseFloat(elements.stockConcInput.value);
  const platingVolumeUl = parseFloat(elements.platingVolumeInput.value);
  const finalPrepVolumeMl = parseFloat(elements.finalPrepVolumeInput.value);
  const desiredSingles = parseFloat(elements.desiredClonesInput.value);
  const totalWells = elements.totalWellsSelect.value === "custom"
    ? parseFloat(elements.customWellsInput.value)
    : parseFloat(elements.totalWellsSelect.value);

  return {
    lambda,
    compareEnabled: elements.enableCompare.checked,
    compareLambda,
    targetMinPercent,
    targetMaxPercent,
    tableMaxLambda,
    stockConc,
    platingVolumeUl,
    finalPrepVolumeMl,
    desiredSingles,
    totalWells
  };
}

function validateState(state) {
  let valid = true;

  if (!(state.lambda > 0 && state.lambda <= 3)) {
    elements.lambdaError.textContent = "Lambda must be greater than 0 and less than or equal to 3.";
    valid = false;
  }

  if (!(state.targetMinPercent < state.targetMaxPercent)) {
    elements.targetError.textContent = "Target minimum must be lower than target maximum.";
    valid = false;
  }

  if (state.compareEnabled && !(state.compareLambda > 0 && state.compareLambda <= 3)) {
    elements.compareError.textContent = "Comparison lambda must be greater than 0 and less than or equal to 3.";
    valid = false;
  }

  if (!(state.totalWells > 0) || !(state.desiredSingles >= 0)) {
    elements.plannerError.textContent = "Total wells must be positive and desired single-cell wells cannot be negative.";
    valid = false;
  }

  if (!(state.stockConc > 0) || !(state.platingVolumeUl > 0) || !(state.finalPrepVolumeMl > 0)) {
    elements.dilutionInputError.textContent = "Stock concentration, plating volume, and final prep volume must all be positive.";
    valid = false;
  }

  return valid;
}

function setInputsFromState(state) {
  elements.lambdaSlider.value = state.lambda.toFixed(2);
  elements.lambdaNumber.value = state.lambda.toFixed(2);
  elements.compareLambdaInput.value = state.compareLambda.toFixed(2);
  elements.targetMinSlider.value = String(state.targetMinPercent);
  elements.targetMaxSlider.value = String(state.targetMaxPercent);
  elements.tableMaxLambdaSlider.value = state.tableMaxLambda.toFixed(1);
}

function updateTopMetrics(state) {
  const probs = poissonProbabilities(state.lambda);
  const singleWells96 = probs.p1 * PLATE_SIZE;

  elements.p0Value.textContent = formatPercent(probs.p0);
  elements.p1Value.textContent = `${formatPercent(probs.p1)} (${singleWells96.toFixed(1)} / ${PLATE_SIZE})`;
  elements.p2PlusValue.textContent = formatPercent(probs.p2Plus);
  elements.singleWells96Value.textContent = singleWells96.toFixed(1);

  elements.targetMinValue.textContent = `${state.targetMinPercent.toFixed(0)}%`;
  elements.targetMaxValue.textContent = `${state.targetMaxPercent.toFixed(0)}%`;
  elements.tableMaxLambdaValue.textContent = state.tableMaxLambda.toFixed(1);

  const targetMin = state.targetMinPercent / 100;
  const targetMax = state.targetMaxPercent / 100;
  const feasibleUpper = Math.min(targetMax, MAX_SINGLE_PROB);
  const lower = clamp(targetMin, 0, MAX_SINGLE_PROB);

  if (targetMin > MAX_SINGLE_PROB) {
    elements.optimumAdvice.textContent =
      `Target minimum is above the Poisson maximum P(1) of ${(MAX_SINGLE_PROB * 100).toFixed(2)}%.`;
    return;
  }
  if (feasibleUpper < lower) {
    elements.optimumAdvice.textContent = "Target range is invalid under Poisson assumptions.";
    return;
  }

  const lowRoots = solveLambdaForTargetSingle(lower);
  const highRoots = solveLambdaForTargetSingle(feasibleUpper);
  elements.optimumAdvice.textContent =
    `Recommended lambda ranges for ${state.targetMinPercent.toFixed(0)}-${state.targetMaxPercent.toFixed(0)}% P(1): ` +
    `${lowRoots[0].toFixed(2)} to ${highRoots[0].toFixed(2)} and ${highRoots[1].toFixed(2)} to ${lowRoots[1].toFixed(2)}.`;
}

function buildMarkerCell(isPrimary, isCompare) {
  const parts = [];
  if (isPrimary) {
    parts.push('<span class="marker-pill"><span class="dot primary"></span>Primary</span>');
  }
  if (isCompare) {
    parts.push('<span class="marker-pill"><span class="dot compare"></span>Compare</span>');
  }
  return parts.join("") || "-";
}

function renderTable(state) {
  const tbody = elements.resultsTableBody;
  tbody.innerHTML = "";

  const targetMin = state.targetMinPercent / 100;
  const targetMax = state.targetMaxPercent / 100;
  const primaryRowKey = Number(state.lambda.toFixed(1));
  const compareRowKey = Number(state.compareLambda.toFixed(1));

  for (let lambda = 0; lambda <= state.tableMaxLambda + 1e-9; lambda += 0.1) {
    const l = Number(lambda.toFixed(1));
    const probs = poissonProbabilities(l);
    const singleWells96 = probs.p1 * PLATE_SIZE;
    const inBand = probs.p1 >= targetMin && probs.p1 <= targetMax;

    const isPrimary = l === primaryRowKey;
    const isCompare = state.compareEnabled && l === compareRowKey;

    const tr = document.createElement("tr");
    if (inBand) {
      tr.classList.add("in-band");
    }
    if (isPrimary) {
      tr.classList.add("mark-primary");
    }
    if (isCompare) {
      tr.classList.add("mark-compare");
    }

    tr.innerHTML = `
      <td>${l.toFixed(1)}</td>
      <td>${formatPercent(probs.p0)}</td>
      <td>${formatPercent(probs.p1)}</td>
      <td>${formatPercent(probs.p2Plus)}</td>
      <td>${singleWells96.toFixed(1)}</td>
      <td><span class="badge ${inBand ? "good" : "no"}">${inBand ? "Yes" : "No"}</span></td>
      <td>${buildMarkerCell(isPrimary, isCompare)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function calculateDilutionForLambda(lambda, state) {
  const requiredCsusp = (1000 * lambda) / state.platingVolumeUl;
  const dilutionFactor = state.stockConc / requiredCsusp;
  const stockVolumeMl = (requiredCsusp * state.finalPrepVolumeMl) / state.stockConc;
  const stockVolumeUl = stockVolumeMl * 1000;
  const mediumVolumeMl = Math.max(state.finalPrepVolumeMl - stockVolumeMl, 0);

  return { requiredCsusp, dilutionFactor, stockVolumeMl, stockVolumeUl, mediumVolumeMl };
}

function updateDilutionPlanner(state) {
  const dilution = calculateDilutionForLambda(state.lambda, state);

  elements.requiredCsuspValue.textContent = `${formatNumber(dilution.requiredCsusp, 4)} cells/mL`;
  elements.dilutionFactorValue.textContent = `${formatNumber(dilution.dilutionFactor, 1)}x`;
  elements.stockVolumeValue.textContent = `${formatNumber(dilution.stockVolumeUl, 3)} uL (${formatNumber(dilution.stockVolumeMl, 6)} mL)`;
  elements.mediumVolumeValue.textContent = `${formatNumber(dilution.mediumVolumeMl, 4)} mL`;

  if (dilution.stockVolumeUl < 2) {
    elements.dilutionAdvice.textContent = "Stock volume is below 2 uL; use serial dilutions for reliable pipetting.";
  } else {
    elements.dilutionAdvice.textContent =
      `Prepare ${formatNumber(state.finalPrepVolumeMl, 3)} mL by combining ${formatNumber(dilution.stockVolumeUl, 3)} uL stock with ${formatNumber(dilution.mediumVolumeMl, 4)} mL medium.`;
  }

  elements.primarySummary.textContent =
    `lambda=${state.lambda.toFixed(2)} | P(0) ${formatPercent(poissonProbabilities(state.lambda).p0, 1)} | ` +
    `P(1) ${formatPercent(poissonProbabilities(state.lambda).p1, 1)} | P(2+) ${formatPercent(poissonProbabilities(state.lambda).p2Plus, 1)}`;
  elements.primaryDilutionSummary.textContent = `Csusp ${formatNumber(dilution.requiredCsusp, 4)} cells/mL; stock ${formatNumber(dilution.stockVolumeUl, 2)} uL for ${formatNumber(state.finalPrepVolumeMl, 2)} mL`;

  if (!state.compareEnabled) {
    elements.compareSummary.textContent = "Enable comparison";
    elements.compareDilutionSummary.textContent = "-";
    return;
  }

  const cProbs = poissonProbabilities(state.compareLambda);
  const cDilution = calculateDilutionForLambda(state.compareLambda, state);
  elements.compareSummary.textContent =
    `lambda=${state.compareLambda.toFixed(2)} | P(0) ${formatPercent(cProbs.p0, 1)} | P(1) ${formatPercent(cProbs.p1, 1)} | P(2+) ${formatPercent(cProbs.p2Plus, 1)}`;
  elements.compareDilutionSummary.textContent = `Csusp ${formatNumber(cDilution.requiredCsusp, 4)} cells/mL; stock ${formatNumber(cDilution.stockVolumeUl, 2)} uL for ${formatNumber(state.finalPrepVolumeMl, 2)} mL`;
}

function getPlannerTotalWells() {
  if (elements.totalWellsSelect.value === "custom") {
    return Math.max(parseFloat(elements.customWellsInput.value) || 0, 0);
  }
  return Math.max(parseFloat(elements.totalWellsSelect.value) || 0, 0);
}

function updateExperimentPlanner(state) {
  const totalWells = getPlannerTotalWells();
  const desiredSingles = state.desiredSingles;

  latestPlannerLambda = null;
  elements.usePlannerLambdaButton.disabled = true;

  if (desiredSingles > totalWells * MAX_SINGLE_PROB) {
    elements.plannerAdvice.textContent =
      `Impossible target: maximum expected single-cell wells is ${formatNumber(totalWells * MAX_SINGLE_PROB, 1)} for ${formatNumber(totalWells, 0)} wells.`;
    elements.plannerLambdaValue.textContent = "Not feasible";
    elements.plannerEmptyValue.textContent = "-";
    elements.plannerMultiValue.textContent = "-";
    elements.plannerCsuspValue.textContent = "-";
    return;
  }

  const solvedLambda = solveLowLambdaForDesiredSingles(totalWells, desiredSingles);
  if (solvedLambda === null) {
    elements.plannerAdvice.textContent = "Could not solve lambda for these inputs.";
    return;
  }

  const probs = poissonProbabilities(solvedLambda);
  const expectedEmpty = totalWells * probs.p0;
  const expectedMulti = totalWells * probs.p2Plus;
  const csusp = (1000 * solvedLambda) / state.platingVolumeUl;

  elements.plannerLambdaValue.textContent = solvedLambda.toFixed(3);
  elements.plannerEmptyValue.textContent = formatNumber(expectedEmpty, 1);
  elements.plannerMultiValue.textContent = formatNumber(expectedMulti, 1);
  elements.plannerCsuspValue.textContent = `${formatNumber(csusp, 4)} cells/mL`;

  elements.plannerAdvice.textContent =
    `For ${formatNumber(totalWells, 0)} wells and ${formatNumber(desiredSingles, 0)} desired single-cell wells: lambda≈${solvedLambda.toFixed(3)}.`;

  latestPlannerLambda = solvedLambda;
  elements.usePlannerLambdaButton.disabled = false;
}

function renderPlateSimulation(state) {
  elements.plateGrid.innerHTML = "";

  let empty = 0;
  let single = 0;
  let multi = 0;

  for (let i = 0; i < ROWS * COLS; i += 1) {
    const cells = poissonRandom(state.lambda);
    const well = document.createElement("div");
    well.classList.add("well");

    if (cells === 0) {
      well.classList.add("empty");
      empty += 1;
    } else if (cells === 1) {
      well.classList.add("single");
      single += 1;
    } else {
      well.classList.add("multi");
      multi += 1;
    }

    well.title = `Well ${i + 1}: ${cells} cell${cells === 1 ? "" : "s"}`;
    elements.plateGrid.appendChild(well);
  }

  elements.plateSummary.textContent = `Simulation outcome: ${empty} empty, ${single} single-cell, ${multi} multi-cell wells.`;
}

function exportTableCsv() {
  const rows = [["lambda", "P0", "P1", "P2plus", "expected_single_wells_96", "p1_in_target", "markers"]];
  const bodyRows = elements.resultsTableBody.querySelectorAll("tr");
  bodyRows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    rows.push(Array.from(cells).map((c) => c.textContent.replace(/\s+/g, " ").trim()));
  });

  const csv = rows.map((line) => line.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "limiting-dilution-poisson-table.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const chartOverlayPlugin = {
  id: "chartOverlayPlugin",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) {
      return;
    }

    const drawVLine = (xValue, color, label) => {
      const x = scales.x.getPixelForValue(xValue);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "600 12px IBM Plex Sans";
      ctx.fillText(label, Math.min(x + 5, chartArea.right - 48), chartArea.top + (label.includes("Compare") ? 28 : 14));
      ctx.restore();
    };

    drawVLine(pluginOptions.lambda, "rgba(29, 78, 216, 0.9)", `Primary ${pluginOptions.lambda.toFixed(2)}`);
    if (pluginOptions.compareEnabled) {
      drawVLine(pluginOptions.compareLambda, "rgba(180, 83, 9, 0.9)", `Compare ${pluginOptions.compareLambda.toFixed(2)}`);
    }

    const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
    if (active.length > 0) {
      const activePoint = active[0].element;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(18, 34, 47, 0.35)";
      ctx.beginPath();
      ctx.moveTo(activePoint.x, chartArea.top);
      ctx.lineTo(activePoint.x, chartArea.bottom);
      ctx.moveTo(chartArea.left, activePoint.y);
      ctx.lineTo(chartArea.right, activePoint.y);
      ctx.stroke();
      ctx.restore();
    }

    const labels = ["P(0)", "P(1)", "P(2+)"];
    chart.data.datasets.forEach((dataset, index) => {
      const lastIndex = dataset.data.length - 1;
      const labelY = scales.y.getPixelForValue(dataset.data[lastIndex].y);
      ctx.save();
      ctx.fillStyle = dataset.borderColor;
      ctx.font = "600 12px IBM Plex Sans";
      ctx.fillText(labels[index], chartArea.right - 42, labelY - 4);
      ctx.restore();
    });
  }
};

function buildChartDatasets(maxLambda) {
  const step = 0.02;
  const p0 = [];
  const p1 = [];
  const p2 = [];

  for (let lambda = 0; lambda <= maxLambda + 1e-9; lambda += step) {
    const l = Number(lambda.toFixed(3));
    const probs = poissonProbabilities(l);
    p0.push({ x: l, y: probs.p0 });
    p1.push({ x: l, y: probs.p1 });
    p2.push({ x: l, y: probs.p2Plus });
  }

  return { p0, p1, p2 };
}

function ensureChart(state) {
  if (!window.Chart) {
    return;
  }

  const datasets = buildChartDatasets(state.tableMaxLambda);

  if (!poissonChart) {
    poissonChart = new Chart(elements.poissonChartCanvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          { label: "P(0 cells)", data: datasets.p0, borderColor: "#2563eb", borderWidth: 2, pointRadius: 0, tension: 0.2 },
          { label: "P(1 cell)", data: datasets.p1, borderColor: "#f59e0b", borderWidth: 2, pointRadius: 0, tension: 0.2 },
          { label: "P(2+ cells)", data: datasets.p2, borderColor: "#0f766e", borderWidth: 2, pointRadius: 0, tension: 0.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              title(items) {
                if (!items.length) {
                  return "";
                }
                return `lambda ${items[0].parsed.x.toFixed(2)}`;
              },
              label(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
              }
            }
          },
          chartOverlayPlugin: {
            lambda: state.lambda,
            compareEnabled: state.compareEnabled,
            compareLambda: state.compareLambda
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: state.tableMaxLambda,
            title: { display: true, text: "lambda (cells per well)" },
            grid: { color: "rgba(18, 34, 47, 0.08)" }
          },
          y: {
            min: 0,
            max: 1,
            title: { display: true, text: "Probability" },
            grid: { color: "rgba(18, 34, 47, 0.08)" }
          }
        },
        layout: {
          padding: { right: 56 }
        }
      },
      plugins: [chartOverlayPlugin]
    });
    return;
  }

  poissonChart.data.datasets[0].data = datasets.p0;
  poissonChart.data.datasets[1].data = datasets.p1;
  poissonChart.data.datasets[2].data = datasets.p2;
  poissonChart.options.plugins.chartOverlayPlugin.lambda = state.lambda;
  poissonChart.options.plugins.chartOverlayPlugin.compareEnabled = state.compareEnabled;
  poissonChart.options.plugins.chartOverlayPlugin.compareLambda = state.compareLambda;
  poissonChart.options.scales.x.max = state.tableMaxLambda;
  poissonChart.update("none");
}

function setMainLambda(lambda) {
  const clamped = clamp(lambda, 0.01, 3);
  elements.lambdaSlider.value = clamped.toFixed(2);
  elements.lambdaNumber.value = clamped.toFixed(2);
}

function updateAll({ rerollPlate = false } = {}) {
  clearErrors();

  const state = getState();
  if (!validateState(state)) {
    return;
  }

  setInputsFromState(state);
  updateTopMetrics(state);
  renderTable(state);
  updateDilutionPlanner(state);
  updateExperimentPlanner(state);
  ensureChart(state);

  if (rerollPlate || !elements.plateGrid.children.length) {
    renderPlateSimulation(state);
  }
}

function resetDefaults() {
  setMainLambda(DEFAULTS.lambda);
  elements.enableCompare.checked = DEFAULTS.compareEnabled;
  elements.compareLambdaInput.value = DEFAULTS.compareLambda.toFixed(2);
  elements.targetMinSlider.value = String(DEFAULTS.targetMinPercent);
  elements.targetMaxSlider.value = String(DEFAULTS.targetMaxPercent);
  elements.tableMaxLambdaSlider.value = DEFAULTS.tableMaxLambda.toFixed(1);
  elements.totalWellsSelect.value = DEFAULTS.totalWells;
  elements.customWellsInput.value = String(DEFAULTS.customWells);
  elements.customWellsInput.hidden = true;
  elements.desiredClonesInput.value = String(DEFAULTS.desiredSingles);
  elements.stockConcInput.value = String(DEFAULTS.stockConc);
  elements.platingVolumeInput.value = String(DEFAULTS.platingVolumeUl);
  elements.finalPrepVolumeInput.value = String(DEFAULTS.finalPrepVolumeMl);
  updateAll({ rerollPlate: true });
}

function setupEvents() {
  elements.lambdaSlider.addEventListener("input", () => {
    elements.lambdaNumber.value = parseFloat(elements.lambdaSlider.value).toFixed(2);
    updateAll();
  });

  elements.lambdaNumber.addEventListener("change", () => {
    const value = clamp(parseFloat(elements.lambdaNumber.value) || DEFAULTS.lambda, 0.01, 3);
    elements.lambdaSlider.value = value.toFixed(2);
    elements.lambdaNumber.value = value.toFixed(2);
    updateAll();
  });

  elements.compareLambdaInput.addEventListener("change", updateAll);
  elements.enableCompare.addEventListener("change", () => {
    elements.compareCard.style.opacity = elements.enableCompare.checked ? "1" : "0.72";
    updateAll();
  });

  elements.targetMinSlider.addEventListener("input", updateAll);
  elements.targetMaxSlider.addEventListener("input", updateAll);
  elements.tableMaxLambdaSlider.addEventListener("input", updateAll);

  [elements.stockConcInput, elements.platingVolumeInput, elements.finalPrepVolumeInput].forEach((input) => {
    input.addEventListener("input", updateAll);
  });

  elements.totalWellsSelect.addEventListener("change", () => {
    const isCustom = elements.totalWellsSelect.value === "custom";
    elements.customWellsInput.hidden = !isCustom;
    updateAll();
  });
  elements.customWellsInput.addEventListener("input", updateAll);
  elements.desiredClonesInput.addEventListener("input", updateAll);

  elements.usePlannerLambdaButton.addEventListener("click", () => {
    if (latestPlannerLambda !== null) {
      setMainLambda(latestPlannerLambda);
      updateAll({ rerollPlate: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  elements.rerollPlateButton.addEventListener("click", () => updateAll({ rerollPlate: true }));
  elements.resetDefaultsButton.addEventListener("click", resetDefaults);
  elements.exportButton.addEventListener("click", exportTableCsv);
}

setupEvents();
resetDefaults();
