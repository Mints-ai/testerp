/**
 * General purpose CSV exporter utility.
 * Generates and triggers downloading of CSV formatted files from arrays of objects.
 */
export function downloadCSV(
  data: any[],
  headers: string[],
  keys: string[],
  filename: string
) {
  if (!data || !data.length) {
    alert("No records available to export.");
    return;
  }

  // Create CSV rows
  const headerRow = headers.join(",");
  const rows = data.map((item) => {
    return keys
      .map((key) => {
        let val = item[key];
        if (val === undefined || val === null) {
          val = "";
        } else if (Array.isArray(val)) {
          val = val.join(" | ");
        } else if (typeof val === "object") {
          // If it is a Date object, convert to string, otherwise JSON stringify
          if (val instanceof Date || (val.seconds && val.nanoseconds)) {
            val = new Date(val.seconds ? val.seconds * 1000 : val).toLocaleString();
          } else {
            val = JSON.stringify(val);
          }
        }
        
        // Escape standard double quotes
        const formatted = String(val).replace(/"/g, '""');
        return `"${formatted}"`;
      })
      .join(",");
  });

  const csvContent = "\uFEFF" + [headerRow, ...rows].join("\n"); // prepended BOM for Excel UTF-8 compliance
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
