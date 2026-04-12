const PLATE_SIZE = 96;

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
  exportButton: document.getElementById("exportButton")
};

function poissonProbabilities(lambda) {
  const p0 = Math.exp(-lambda);
  const p1 = lambda * p0;
  const p2Plus = Math.max(0, 1 - p0 - p1);

  return { p0, p1, p2Plus };
}

function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function solveLambdaForTargetSingle(target) {
  const maxSingle = 1 / Math.E;
  if (target < 0 || target > maxSingle) {
    return [];
  }

  const f = (lambda) => lambda * Math.exp(-lambda) - target;
  const bisect = (a, b) => {
    let left = a;
    let right = b;
    for (let i = 0; i < 60; i += 1) {
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
  const highRoot = target === maxSingle ? 1 : bisect(1, 20);
  return [lowRoot, highRoot];
}

function getInputs() {
  const lambda = clamp(parseFloat(elements.lambdaSlider.value) || 0, 0, 3);
  const targetMin = (parseFloat(elements.targetMinSlider.value) || 30) / 100;
  const targetMax = (parseFloat(elements.targetMaxSlider.value) || 40) / 100;
  const tableMaxLambda = clamp(parseFloat(elements.tableMaxLambdaSlider.value) || 3, 1, 4);

  return { lambda, targetMin, targetMax, tableMaxLambda };
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
}

function updateAdvice(targetMin, targetMax) {
  const maxSingle = 1 / Math.E;
  const feasibleUpper = Math.min(targetMax, maxSingle);
  const lower = clamp(targetMin, 0, maxSingle);

  if (targetMin > maxSingle) {
    elements.optimumAdvice.textContent =
      `A minimum target of ${(targetMin * 100).toFixed(0)}% is above the Poisson maximum single occupancy of ${(maxSingle * 100).toFixed(2)}%. Lower the minimum target.`;
    return;
  }

  if (feasibleUpper < lower) {
    elements.optimumAdvice.textContent =
      "The chosen target band is not feasible under Poisson assumptions. Increase the max target or lower the min target.";
    return;
  }

  const lowRoots = solveLambdaForTargetSingle(lower);
  const highRoots = solveLambdaForTargetSingle(feasibleUpper);

  if (lowRoots.length === 0 || highRoots.length === 0) {
    elements.optimumAdvice.textContent =
      "No feasible seeding range found for this target. Try adjusting target bounds.";
    return;
  }

  const lowIntervalStart = lowRoots[0];
  const lowIntervalEnd = highRoots[0];
  const highIntervalStart = highRoots[1];
  const highIntervalEnd = lowRoots[1];

  const maxAt = 1;
  const maxExpectedSingles = (maxSingle * PLATE_SIZE).toFixed(1);

  const upperNote = targetMax > maxSingle
    ? ` Upper target clipped at ${(maxSingle * 100).toFixed(2)}% (Poisson maximum).`
    : "";

  elements.optimumAdvice.textContent =
    `Recommended λ ranges for ${(lower * 100).toFixed(0)}-${(targetMax * 100).toFixed(0)}% single occupancy: ` +
    `${lowIntervalStart.toFixed(2)} to ${lowIntervalEnd.toFixed(2)} and ` +
    `${highIntervalStart.toFixed(2)} to ${highIntervalEnd.toFixed(2)} cells/well.` +
    ` Peak single occupancy occurs at λ=${maxAt.toFixed(2)} (${(maxSingle * 100).toFixed(2)}%, ~${maxExpectedSingles} single wells in 96).` +
    upperNote;
}

function renderTable(targetMin, targetMax, tableMaxLambda) {
  const tbody = elements.resultsTableBody;
  tbody.innerHTML = "";

  const step = 0.1;
  for (let lambda = 0; lambda <= tableMaxLambda + 1e-9; lambda += step) {
    const roundedLambda = parseFloat(lambda.toFixed(1));
    const { p0, p1, p2Plus } = poissonProbabilities(roundedLambda);
    const singleWells96 = p1 * PLATE_SIZE;
    const inBand = p1 >= targetMin && p1 <= targetMax;

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
    "in_target_band"
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

function normalizeTargetBounds() {
  let min = parseFloat(elements.targetMinSlider.value);
  let max = parseFloat(elements.targetMaxSlider.value);

  if (min > max) {
    [min, max] = [max, min];
    elements.targetMinSlider.value = String(min);
    elements.targetMaxSlider.value = String(max);
  }
}

function syncLambdaFromSlider() {
  elements.lambdaNumber.value = parseFloat(elements.lambdaSlider.value).toFixed(2);
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
}

setupEvents();
syncLambdaFromSlider();
