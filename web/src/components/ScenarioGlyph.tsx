const BAR_HEIGHTS = [40, 55, 35, 60, 45, 70, 30, 65, 50, 78, 38, 58, 42, 68, 22, 48];

export function ScenarioGlyph() {
  return (
    <div className="relative">
      <div className="absolute -right-3 -top-3 h-full w-full rounded-3xl bg-[#7c3aed]" aria-hidden="true" />
      <div className="relative flex h-72 w-72 items-end justify-center gap-[5px] rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-sm sm:h-80 sm:w-80">
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="w-full rounded-t-md"
            style={{
              height: `${h}%`,
              background: i === 14 ? "#dc2626" : "#7c3aed",
              opacity: i === 14 ? 1 : 0.3 + (h / 78) * 0.55,
            }}
          />
        ))}
      </div>
    </div>
  );
}
