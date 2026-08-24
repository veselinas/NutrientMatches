// ============================================================
// Venn — draws fixed-layout 2/3-circle "petri dish" diagrams as SVG
// and exposes clickable region hotspots that hand back the exact
// food-key set for that region (so the UI can list it, and future
// features like meal-suggestion-from-intersection can reuse it).
// ============================================================
const Venn = (() => {
  const COLORS = {
    a: "var(--circle-a)",
    b: "var(--circle-b)",
    c: "var(--circle-c)",
  };

  function computeRegions3(A, B, C) {
    return {
      onlyA: Utils.subtract(Utils.subtract(A, B), C),
      onlyB: Utils.subtract(Utils.subtract(B, A), C),
      onlyC: Utils.subtract(Utils.subtract(C, A), B),
      ab: Utils.subtract(Utils.intersect(A, B), C),
      ac: Utils.subtract(Utils.intersect(A, C), B),
      bc: Utils.subtract(Utils.intersect(B, C), A),
      abc: Utils.intersect(A, B, C),
    };
  }
  function computeRegions2(A, B) {
    return {
      onlyA: Utils.subtract(A, B),
      onlyB: Utils.subtract(B, A),
      ab: Utils.intersect(A, B),
    };
  }

  function svgOpen(viewBox) {
    return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" class="venn-svg">`;
  }

  function circle(cx, cy, r, fill, extraClass = "") {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" class="venn-circle ${extraClass}" fill="${fill}" />
            <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" class="venn-ring" fill="none" />`;
  }

  function hotspot(cx, cy, count, region, size = 15) {
    const r = Math.max(13, Math.min(24, 13 + Math.sqrt(count) * 3));
    return `<g class="venn-hotspot" data-region="${region}" tabindex="0" role="button"
              aria-label="${count} items">
        <circle cx="${cx}" cy="${cy}" r="${r}" class="hotspot-circle" />
        <text x="${cx}" y="${cy}" class="hotspot-count">${count}</text>
      </g>`;
  }

    function legendHtml(entries) {
    // entries: [[label, colorVarName], ...]
    return `<ul class="venn-legend">${entries
      .map(
        ([text, colorVar]) =>
          `<li><span class="legend-swatch" style="background:var(${colorVar})"></span>${Utils.escapeHtml(text)}</li>`
      )
      .join("")}</ul>`;
  }

  // --- 3-circle layout ---
  function render3(container, opts) {
    const { aLabel, bLabel, cLabel, aSet, bSet, cSet, onRegionClick } = opts;
    const regions = computeRegions3(aSet, bSet, cSet);
    const cx1 = 200, cy1 = 150, r = 118;
    const cx2 = 300, cy2 = 150;
    const cx3 = 250, cy3 = 237;

    const pos = {
      onlyA: [138, 115], onlyB: [362, 115], onlyC: [250, 327],
      ab: [250, 115], ac: [172, 225], bc: [328, 225], abc: [250, 180],
    };

    let svg = svgOpen("0 15 500 335");
    svg += circle(cx1, cy1, r, COLORS.a, "circle-a");
    svg += circle(cx2, cy2, r, COLORS.b, "circle-b");
    svg += circle(cx3, cy3, r, COLORS.c, "circle-c");
    for (const [region, set] of Object.entries(regions)) {
      const [x, y] = pos[region];
      svg += hotspot(x, y, set.size, region);
    }
    svg += "</svg>";
    container.innerHTML = svg + legendHtml([[aLabel, "--circle-a"], [bLabel, "--circle-b"], [cLabel, "--circle-c"]]);
    wireHotspots(container, regions, onRegionClick);
    return regions;
  }

  // --- 2-circle layout ---
  function render2(container, opts) {
    const { aLabel, bLabel, aSet, bSet, onRegionClick } = opts;
    const regions = computeRegions2(aSet, bSet);
    const cx1 = 165, cy1 = 150, r = 125;
    const cx2 = 275, cy2 = 150;
    const pos = { onlyA: [105, 150], onlyB: [335, 150], ab: [220, 150] };

    let svg = svgOpen("0 25 440 250");
    svg += circle(cx1, cy1, r, COLORS.a, "circle-a");
    svg += circle(cx2, cy2, r, COLORS.b, "circle-b");
    for (const [region, set] of Object.entries(regions)) {
      const [x, y] = pos[region];
      svg += hotspot(x, y, set.size, region);
    }
    svg += "</svg>";
    container.innerHTML = svg + legendHtml([[aLabel, "--circle-a"], [bLabel, "--circle-b"]]);
    wireHotspots(container, regions, onRegionClick);
    return regions;
  }

  function wireHotspots(container, regions, onRegionClick) {
    if (!onRegionClick) return;
    container.querySelectorAll(".venn-hotspot").forEach((el) => {
      const region = el.getAttribute("data-region");
      const fire = () => onRegionClick(region, regions[region]);
      el.addEventListener("click", fire);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fire(); });
    });
  }

  return { render2, render3, computeRegions2, computeRegions3 };
})();
