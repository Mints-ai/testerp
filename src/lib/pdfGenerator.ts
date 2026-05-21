import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generateInternCertificate = (internName: string, department: string, issueDate: string) => {
  const doc = new jsPDF("landscape", "pt", "a4");
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Draw background border
  doc.setDrawColor(107, 124, 75); // Olive 500
  doc.setLineWidth(10);
  doc.rect(20, 20, width - 40, height - 40);
  
  doc.setDrawColor(138, 155, 106); // Olive 400
  doc.setLineWidth(2);
  doc.rect(35, 35, width - 70, height - 70);

  // Logo / Header
  doc.setTextColor(20, 24, 16); // Olive 900
  doc.setFontSize(40);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIFICATE OF COMPLETION", width / 2, 140, { align: "center" });

  // Body
  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text("This is to certify that", width / 2, 220, { align: "center" });

  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(78, 93, 53); // Olive 600
  doc.text(internName, width / 2, 280, { align: "center" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 24, 16);
  doc.text(
    `has successfully completed their internship program in the`,
    width / 2,
    340,
    { align: "center" }
  );

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${department} Department`, width / 2, 380, { align: "center" });

  // Date and Signatures
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Date of Issue: ${issueDate}`, 100, 480);
  
  doc.line(width - 250, 470, width - 100, 470);
  doc.text("Authorized Signature", width - 175, 490, { align: "center" });
  
  doc.text("MINTS GLOBAL", width / 2, 530, { align: "center" });

  // Save the PDF
  doc.save(`Certificate_${internName.replace(/\s+/g, '_')}.pdf`);
};

export const generateInvoice = (
  invoiceData: {
    invoiceNumber: string;
    date: string;
    clientName: string;
    items: { description: string; amount: number }[];
    total: number;
    status: string;
  }
) => {
  const doc = new jsPDF("portrait", "pt", "a4");
  const width = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 24, 16);
  doc.text("INVOICE", 40, 60);

  doc.setFontSize(12);
  doc.setTextColor(138, 155, 106);
  doc.text("MINTS GLOBAL", 40, 80);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("123 Creative Avenue, Suite 100", 40, 95);
  doc.text("Global HQ", 40, 110);

  // Invoice Details
  doc.setFontSize(12);
  doc.setTextColor(20, 24, 16);
  doc.setFont("helvetica", "bold");
  doc.text("Billed To:", width - 200, 60);
  
  doc.setFont("helvetica", "normal");
  doc.text(invoiceData.clientName, width - 200, 80);
  
  doc.text(`Invoice Number: ${invoiceData.invoiceNumber}`, width - 200, 110);
  doc.text(`Date: ${invoiceData.date}`, width - 200, 125);
  doc.text(`Status: ${invoiceData.status.toUpperCase()}`, width - 200, 140);

  // Table
  const tableData = invoiceData.items.map(item => [item.description, `$${item.amount.toFixed(2)}`]);
  
  autoTable(doc, {
    startY: 180,
    head: [["Description", "Amount"]],
    body: tableData,
    foot: [["Total", `$${invoiceData.total.toFixed(2)}`]],
    theme: "striped",
    headStyles: { fillColor: [107, 124, 75] },
    footStyles: { fillColor: [20, 24, 16], fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" }
    }
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 180;
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text("Thank you for your business!", width / 2, finalY + 50, { align: "center" });

  doc.save(`Invoice_${invoiceData.invoiceNumber}.pdf`);
};

export const generateQuote = (
  quoteData: {
    quoteNumber: string;
    date: string;
    clientName: string;
    contactName: string;
    items: { description: string; amount: number }[];
    total: number;
  }
) => {
  const doc = new jsPDF("portrait", "pt", "a4");
  const width = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 24, 16);
  doc.text("PROPOSAL & QUOTE", 40, 60);

  doc.setFontSize(12);
  doc.setTextColor(138, 155, 106);
  doc.text("MINTS GLOBAL", 40, 80);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("123 Creative Avenue, Suite 100", 40, 95);
  doc.text("Global HQ", 40, 110);

  // Quote Details
  doc.setFontSize(12);
  doc.setTextColor(20, 24, 16);
  doc.setFont("helvetica", "bold");
  doc.text("Prepared For:", width - 200, 60);
  
  doc.setFont("helvetica", "normal");
  doc.text(quoteData.clientName, width - 200, 80);
  doc.text(quoteData.contactName, width - 200, 95);
  
  doc.text(`Quote Number: ${quoteData.quoteNumber}`, width - 200, 125);
  doc.text(`Date: ${quoteData.date}`, width - 200, 140);
  doc.text("Valid For: 30 Days", width - 200, 155);

  // Table
  const tableData = quoteData.items.map(item => [item.description, `${item.amount.toLocaleString()} AED`]);
  
  autoTable(doc, {
    startY: 190,
    head: [["Service Description", "Investment"]],
    body: tableData,
    foot: [["Total Investment", `${quoteData.total.toLocaleString()} AED`]],
    theme: "striped",
    headStyles: { fillColor: [107, 124, 75] },
    footStyles: { fillColor: [20, 24, 16], fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" }
    }
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 190;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("This quote is subject to our standard terms of service.", 40, finalY + 40);
  doc.text("To accept this proposal, please sign and return this document.", 40, finalY + 55);
  
  doc.line(40, finalY + 120, 240, finalY + 120);
  doc.text("Client Signature", 100, finalY + 135);

  doc.line(width - 240, finalY + 120, width - 40, finalY + 120);
  doc.text("Date", width - 150, finalY + 135);

  doc.save(`Quote_${quoteData.quoteNumber}.pdf`);
};

export const generatePayslip = (
  payslipData: {
    payslipNumber: string;
    employeeName: string;
    role: string;
    period: string;
    baseSalary: number;
    deductions: number;
    netPay: number;
    unpaidLeaves: number;
  }
) => {
  const doc = new jsPDF("portrait", "pt", "a4");
  const width = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text("SALARY PAYSLIP", 40, 60);

  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229); // Indigo 600
  doc.text("MINTS GLOBAL", 40, 80);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("123 Creative Avenue, Suite 100", 40, 95);
  doc.text("Global HQ", 40, 110);

  // Employee Details
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Employee Details:", width - 200, 60);
  
  doc.setFont("helvetica", "normal");
  doc.text(payslipData.employeeName, width - 200, 80);
  doc.text(payslipData.role.toUpperCase(), width - 200, 95);
  
  doc.text(`Payslip Number: ${payslipData.payslipNumber}`, width - 200, 125);
  doc.text(`Pay Period: ${payslipData.period}`, width - 200, 140);

  // Salary Table
  autoTable(doc, {
    startY: 180,
    head: [["Earnings", "Amount"], ["Deductions", "Amount"]],
    body: [
      ["Base Salary", `${payslipData.baseSalary.toLocaleString()} AED`, "Unpaid Leaves (LWP)", `-${payslipData.deductions.toLocaleString()} AED`],
      ["", "", `(${payslipData.unpaidLeaves} Days)`, ""]
    ],
    foot: [["NET PAY", { content: `${payslipData.netPay.toLocaleString()} AED`, colSpan: 3, styles: { halign: 'right' } }]],
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
    footStyles: { fillColor: [15, 23, 42], fontStyle: "bold" }, // Slate 900
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 180;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("This is a computer-generated document and requires no physical signature.", width / 2, finalY + 50, { align: "center" });

  doc.save(`Payslip_${payslipData.employeeName.replace(/\s+/g, '_')}_${payslipData.period.replace(/\s+/g, '')}.pdf`);
};
