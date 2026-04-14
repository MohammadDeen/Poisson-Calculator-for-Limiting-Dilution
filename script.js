const PLATE_SIZE = 96;
const MAX_SINGLE_PROB = 1 / Math.E;

const elements = {
  lambdaSlider: document.getElementById("lambdaSlider"),
  lambdaNumber: document.getElementById("lambdaNumber"),
  targetMinSlider: document.getElementById("targetMinSlider"),
  targetMaxSlider: document.getElementById("targetMaxSlider"),
  tableMaxLambdaSlider: document.getElementById("tableMaxLambdaSlider"),
  targetMinValue: document.getElementById("targetMinValue"),
  targetMaxValue: document.getElementById("targetMaxValue"),
  tableMaxLambdaValue: document.getElementById("tableMaxLambdaValue"),
  p0Value: document.getElementById("p0Value"),
  p1Value: document.getElementById("p1Value"),
  p2PlusValue: document.getElementById("p2PlusValue"),
  singleWells96Value: document.getElementById("singleWells96Value"),
  optimumAdvice: document.getElementById("optimumAdvice"),
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
  usePlannerLambdaButton: document.getElementById("usePlannerLambdaButton")
};

let poissonChart;
let latestPlannerLambda = null;

function poissonProbabilities(lambda) {
  const p0 = Math.exp(-lambda);
  const p1 = lambda * p0;
  const p2Plus = Math.max(0, 1 - p0 - p1);
  return { p0, p1, p2Plus };
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

function getInputs() {
  const lambda = clamp(parseFloat(elements.lambdaSlider.value) || 0, 0, 3);
  const targetMin = (parseFloat(elements.targetMinSlider.value) || 30) / 100;
  const targetMax = (parseFloat(elements.targetMaxSlider.value) || 40) / 100;
  const tableMaxLambda = clamp(parseFloat(elements.tableMaxLambdaSlider.value) || 3, 1, 3);
  return { lambda, targetMin, targetMax, tableMaxLambda };
}

function getTotalWellsForPlanner() {
  if (elements.totalWellsSelect.value === "custom") {
    return Math.max(parseFloat(elements.customWellsInput.value) || 0, 0);
  }
  return Math.max(parseFloat(elements.totalWellsSelect.value) || 0, 0);
}

function updateResults() {
  const { lambda, targetMin, targetMax, tableMaxLambda } = getInputs();
  const { p0, p1, p2Plus } = poissonProbabilities(lambda);
  const singleWells96 = p1 * PLATE_SIZE;

  elements.p0Value.textContent = formatPercent(p0);
  elements.p1Value.textContent = `${formatPercent(p1)} (${singleWells96.toFixed(1)} / ${PLATE_SIZE})`;
  elements.p2PlusValue.textContent = formatPercent(p2Plus);
  elements.singleWells96Value.textContent = singleWells96.toFixed(1);

  elements.targetMinValue.textContent = `${(targetMin * 100).toFixed(0)}%`;
  elements.targetMaxValue.textContent = `${(targetMax * 100).toFixed(0)}%`;
  elements.tableMaxLambdaValue.textContent = tableMaxLambda.toFixed(1);

  updateAdvice(targetMin, targetMax);
  renderTable(targetMin, targetMax, tableMaxLambda);
  updateDilutionPlanner(lambda);
  updateChart(lambda, tableMaxLambda);
  updateExperimentPlanner();
}

function updateAdvice(targetMin, targetMax) {
  const feasibleUpper = Math.min(targetMax, MAX_SINGLE_PROB);
  const lower = clamp(targetMin, 0, MAX_SINGLE_PROB);

  if (targetMin > MAX_SINGLE_PROB) {
    elements.optimumAdvice.textContent =
      `A minimum P(1) target of ${(targetMin * 100).toFixed(0)}% is above the Poisson maximum single-cell occupancy of ${(MAX_SINGLE_PROB * 100).toFixed(2)}%. Lower the minimum target.`;
    return;
  }

  if (feasibleUpper < lower) {
    elements.optimumAdvice.textContent =
      "The chosen P(1) target range is not feasible under Poisson assumptions. Increase the max target or lower the min target.";
    return;
  }

  const lowRoots = solveLambdaForTargetSingle(lower);
  const highRoots = solveLambdaForTargetSingle(feasibleUpper);

  if (lowRoots.length === 0 || highRoots.length === 0) {
    elements.optimumAdvice.textContent = "No feasible seeding range found for this P(1) target.";
    return;
  }

  const lowIntervalStart = lowRoots[0];
  const lowIntervalEnd = highRoots[0];
  const highIntervalStart = highRoots[1];
  const highIntervalEnd = lowRoots[1];
  const maxExpectedSingles = (MAX_SINGLE_PROB * PLATE_SIZE).toFixed(1);

  const upperNote = targetMax > MAX_SINGLE_PROB
    ? ` Upper target clipped at ${(MAX_SINGLE_PROB * 100).toFixed(2)}% (Poisson maximum).`
    : "";

  elements.optimumAdvice.textContent =
    `Recommended λ ranges for ${(lower * 100).toFixed(0)}-${(targetMax * 100).toFixed(0)}% P(1): ` +
    `${lowIntervalStart.toFixed(2)} to ${lowIntervalEnd.toFixed(2)} and ` +
    `${highIntervalStart.toFixed(2)} to ${highIntervalEnd.toFixed(2)} cells/well. ` +
    `Peak single-cell occupancy occurs at λ=1.00 (${(MAX_SINGLE_PROB * 100).toFixed(2)}% P(1), ~${maxExpectedSingles} single wells in 96).` +
    upperNote;
}

function renderTable(targetMin, targetMax, tableMaxLambda) {
  const tbody = elements.resultsTableBody;
  tbody.innerHTML = "";

  const targetMinPercent = targetMin * 100;
  const targetMaxPercent = targetMax * 100;
  const epsilon = 1e-9;

  const step = 0.1;
  for (let lambda = 0; lambda <= tableMaxLambda + 1e-9; lambda += step) {
    const roundedLambda = parseFloat(lambda.toFixed(1));
    const { p0, p1, p2Plus } = poissonProbabilities(roundedLambda);
    const singleWells96 = p1 * PLATE_SIZE;
    const p1Percent = p1 * 100;
    const inBand = (p1Percent + epsilon) >= targetMinPercent && (p1Percent - epsilon) <= targetMaxPercent;

    const tr = document.createElement("tr");
    if (inBand) {
      tr.classList.add("in-band");
    }

    tr.innerHTML = `
      <td>${roundedLambda.toFixed(1)}</td>
      <td>${formatPercent(p0)}</td>
      <td>${formatPercent(p1)}</td>
      <td>${formatPercent(p2Plus)}</td>
      <td>${singleWells96.toFixed(1)}</td>
      <td><span class="badge ${inBand ? "good" : "no"}">${inBand ? "Yes" : "No"}</span></td>
    `;

    tbody.appendChild(tr);
  }
}

function exportTableCsv() {
  const rows = [[
    "lambda_cells_per_well",
    "P0",
    "P1",
    "P2plus",
    "expected_single_wells_96",
    "p1_within_target_range"
  ]];

  const bodyRows = elements.resultsTableBody.querySelectorAll("tr");
  bodyRows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    rows.push([
      cells[0].textContent,
      cells[1].textContent,
      cells[2].textContent,
      cells[3].textContent,
      cells[4].textContent,
      cells[5].textContent
    ]);
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

function updateDilutionPlanner(lambda) {
  const stockConc = Math.max(parseFloat(elements.stockConcInput.value) || 0, 0);
  const platingVolumeUl = Math.max(parseFloat(elements.platingVolumeInput.value) || 0, 0);
  const finalPrepVolumeMl = Math.max(parseFloat(elements.finalPrepVolumeInput.value) || 0, 0);

  if (platingVolumeUl <= 0 || stockConc <= 0 || finalPrepVolumeMl <= 0) {
    elements.requiredCsuspValue.textContent = "Enter positive inputs";
    elements.dilutionFactorValue.textContent = "-";
    elements.stockVolumeValue.textContent = "-";
    elements.mediumVolumeValue.textContent = "-";
    elements.dilutionAdvice.textContent =
      "Enter positive stock concentration, plating volume, and final prep volume to calculate dilution guidance.";
    return;
  }

  const requiredCsusp = (1000 * lambda) / platingVolumeUl;
  const dilutionFactor = requiredCsusp > 0 ? stockConc / requiredCsusp : Infinity;
  const stockVolumeMl = (requiredCsusp * finalPrepVolumeMl) / stockConc;
  const stockVolumeUl = stockVolumeMl * 1000;
  const mediumVolumeMl = Math.max(finalPrepVolumeMl - stockVolumeMl, 0);

  elements.requiredCsuspValue.textContent = `${formatNumber(requiredCsusp, 4)} cells/mL`;
  elements.dilutionFactorValue.textContent = Number.isFinite(dilutionFactor)
    ? `${formatNumber(dilutionFactor, 1)}x`
    : "-";
  elements.stockVolumeValue.textContent = `${formatNumber(stockVolumeUl, 3)} uL (${formatNumber(stockVolumeMl, 6)} mL)`;
  elements.mediumVolumeValue.textContent = `${formatNumber(mediumVolumeMl, 4)} mL`;

  if (stockVolumeUl < 2) {
    elements.dilutionAdvice.textContent =
      "Calculated stock volume is < 2 uL, which is usually impractical to pipette accurately. Use one or more serial dilutions, then prepare the final mix.";
  } else if (stockVolumeUl > finalPrepVolumeMl * 1000) {
    elements.dilutionAdvice.textContent =
      "Required stock volume exceeds final prep volume. Increase final prep volume or lower target concentration by adjusting lambda or plating volume.";
  } else {
    elements.dilutionAdvice.textContent =
      `Prepare ${formatNumber(finalPrepVolumeMl, 3)} mL by combining ${formatNumber(stockVolumeUl, 3)} uL stock with ${formatNumber(mediumVolumeMl, 4)} mL medium.`;
  }
}

function updateExperimentPlanner() {
  const totalWells = getTotalWellsForPlanner();
  const desiredSingles = Math.max(parseFloat(elements.desiredClonesInput.value) || 0, 0);
  const platingVolumeUl = Math.max(parseFloat(elements.platingVolumeInput.value) || 0, 0);

  latestPlannerLambda = null;
  elements.usePlannerLambdaButton.disabled = true;

  if (totalWells <= 0) {
    elements.plannerAdvice.textContent = "Enter a valid total wells value to solve the experiment plan.";
    elements.plannerLambdaValue.textContent = "-";
    elements.plannerEmptyValue.textContent = "-";
    elements.plannerMultiValue.textContent = "-";
    elements.plannerCsuspValue.textContent = "-";
    return;
  }

  const maxSingles = totalWells * MAX_SINGLE_PROB;
  if (desiredSingles > maxSingles) {
    elements.plannerAdvice.textContent =
      `Impossible target: maximum expected single-cell wells is ${formatNumber(maxSingles, 1)} for ${formatNumber(totalWells, 0)} wells (${(MAX_SINGLE_PROB * 100).toFixed(2)}% max P(1)).`;
    elements.plannerLambdaValue.textContent = "Not feasible";
    elements.plannerEmptyValue.textContent = "-";
    elements.plannerMultiValue.textContent = "-";
    elements.plannerCsuspValue.textContent = "-";
    return;
  }

  const lambda = solveLowLambdaForDesiredSingles(totalWells, desiredSingles);
  if (lambda === null) {
    elements.plannerAdvice.textContent = "Could not solve lambda for these inputs. Try adjusting wells or desired single-cell wells.";
    elements.plannerLambdaValue.textContent = "Not solved";
    elements.plannerEmptyValue.textContent = "-";
    elements.plannerMultiValue.textContent = "-";
    elements.plannerCsuspValue.textContent = "-";
    return;
  }

  const { p0, p2Plus } = poissonProbabilities(lambda);
  const expectedEmpty = totalWells * p0;
  const expectedMulti = totalWells * p2Plus;
  const csusp = platingVolumeUl > 0 ? (1000 * lambda) / platingVolumeUl : 0;

  elements.plannerLambdaValue.textContent = lambda.toFixed(3);
  elements.plannerEmptyValue.textContent = formatNumber(expectedEmpty, 1);
  elements.plannerMultiValue.textContent = formatNumber(expectedMulti, 1);
  elements.plannerCsuspValue.textContent = `${formatNumber(csusp, 4)} cells/mL`;

  elements.plannerAdvice.textContent =
    `For ${formatNumber(totalWells, 0)} wells and ${formatNumber(desiredSingles, 0)} desired single-cell wells, use λ≈${lambda.toFixed(3)} in the 0<λ<1 range to minimize multi-cell contamination.`;

  latestPlannerLambda = lambda;
  elements.usePlannerLambdaButton.disabled = false;
}

const chartOverlayPlugin = {
  id: "chartOverlayPlugin",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) {
      return;
    }

    const lambda = pluginOptions.lambda;
    const x = scales.x.getPixelForValue(lambda);

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(15, 118, 110, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    const labels = ["P(0)", "P(1)", "P(2+)"];
    chart.data.datasets.forEach((dataset, index) => {
      const yValue = poissonProbabilities(lambda)[index === 0 ? "p0" : index === 1 ? "p1" : "p2Plus"];
      const y = scales.y.getPixelForValue(yValue);

      ctx.fillStyle = dataset.borderColor;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();

      const lastIndex = dataset.data.length - 1;
      const labelY = scales.y.getPixelForValue(dataset.data[lastIndex].y);
      ctx.font = "600 12px IBM Plex Sans";
      ctx.fillText(labels[index], chartArea.right - 42, labelY - 4);
    });

    ctx.fillStyle = "#12222f";
    ctx.font = "600 12px IBM Plex Sans";
    ctx.fillText(`λ=${lambda.toFixed(2)}`, Math.min(x + 6, chartArea.right - 45), chartArea.top + 14);
    ctx.restore();
  }
};

function buildChartDatasets(tableMaxLambda) {
  const step = 0.03;
  const p0 = [];
  const p1 = [];
  const p2 = [];

  for (let lambda = 0; lambda <= tableMaxLambda + 1e-9; lambda += step) {
    const rounded = parseFloat(lambda.toFixed(3));
    const probs = poissonProbabilities(rounded);
    p0.push({ x: rounded, y: probs.p0 });
    p1.push({ x: rounded, y: probs.p1 });
    p2.push({ x: rounded, y: probs.p2Plus });
  }

  return { p0, p1, p2 };
}

function ensureChart(lambda, tableMaxLambda) {
  if (!window.Chart) {
    return;
  }

  const datasets = buildChartDatasets(tableMaxLambda);

  if (!poissonChart) {
    poissonChart = new Chart(elements.poissonChartCanvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          {
            label: "P(0 cells)",
            data: datasets.p0,
            borderColor: "#2563eb",
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2
          },
          {
            label: "P(1 cell)",
            data: datasets.p1,
            borderColor: "#f59e0b",
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2
          },
          {
            label: "P(2+ cells)",
            data: datasets.p2,
            borderColor: "#0f766e",
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`;
              }
            }
          },
          chartOverlayPlugin: {
            lambda
          }
        },
        interaction: {
          mode: "nearest",
          intersect: false
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: tableMaxLambda,
            title: {
              display: true,
              text: "λ (cells per well)"
            },
            grid: {
              color: "rgba(18, 34, 47, 0.08)"
            }
          },
          y: {
            min: 0,
            max: 1,
            title: {
              display: true,
              text: "Probability"
            },
            grid: {
              color: "rgba(18, 34, 47, 0.08)"
            }
          }
        },
        layout: {
          padding: {
            right: 48
          }
        }
      },
      plugins: [chartOverlayPlugin]
    });
    return;
  }

  poissonChart.data.datasets[0].data = datasets.p0;
  poissonChart.data.datasets[1].data = datasets.p1;
  poissonChart.data.datasets[2].data = datasets.p2;
  poissonChart.options.plugins.chartOverlayPlugin.lambda = lambda;
  poissonChart.options.scales.x.max = tableMaxLambda;
  poissonChart.update("none");
}

function updateChart(lambda, tableMaxLambda) {
  ensureChart(lambda, tableMaxLambda);
}

function normalizeTargetBounds() {
  let min = parseFloat(elements.targetMinSlider.value);
  let max = parseFloat(elements.targetMaxSlider.value);
  if (min > max) {
    [min, max] = [max, min];
    elements.targetMinSlider.value = String(min);
    elements.targetMaxSlider.value = String(max);
  }
}

function setMainLambda(lambda) {
  const value = clamp(lambda, 0, 3);
  elements.lambdaSlider.value = value.toFixed(2);
  elements.lambdaNumber.value = value.toFixed(2);
  updateResults();
}

function syncLambdaFromSlider() {
  const value = clamp(parseFloat(elements.lambdaSlider.value) || 0, 0, 3);
  elements.lambdaNumber.value = value.toFixed(2);
  updateResults();
}

function syncLambdaFromNumber() {
  const value = clamp(parseFloat(elements.lambdaNumber.value) || 0, 0, 3);
  elements.lambdaSlider.value = value.toFixed(2);
  elements.lambdaNumber.value = value.toFixed(2);
  updateResults();
}

function setupEvents() {
  elements.lambdaSlider.addEventListener("input", syncLambdaFromSlider);
  elements.lambdaNumber.addEventListener("change", syncLambdaFromNumber);

  [elements.targetMinSlider, elements.targetMaxSlider].forEach((slider) => {
    slider.addEventListener("input", () => {
      normalizeTargetBounds();
      updateResults();
    });
  });

  elements.tableMaxLambdaSlider.addEventListener("input", updateResults);
  elements.exportButton.addEventListener("click", exportTableCsv);

  [elements.stockConcInput, elements.platingVolumeInput, elements.finalPrepVolumeInput].forEach((input) => {
    input.addEventListener("input", updateResults);
  });

  elements.totalWellsSelect.addEventListener("change", () => {
    const isCustom = elements.totalWellsSelect.value === "custom";
    elements.customWellsInput.hidden = !isCustom;
    updateResults();
  });

  elements.customWellsInput.addEventListener("input", updateResults);
  elements.desiredClonesInput.addEventListener("input", updateResults);

  elements.usePlannerLambdaButton.addEventListener("click", () => {
    if (latestPlannerLambda !== null) {
      setMainLambda(latestPlannerLambda);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

setupEvents();
setMainLambda(0.7);
