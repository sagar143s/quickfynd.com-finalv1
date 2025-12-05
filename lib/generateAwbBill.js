import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generateAwbBill = (awbDetails) => {
    // 10cm x 15cm = 100mm x 150mm
    const doc = new jsPDF({ unit: 'mm', format: [100, 150], orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = { left: 8, right: 8, top: 8, bottom: 8 };
    let y = margin.top;

    // AWB Bill Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AIR WAYBILL (AWB)', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`AWB Number: ${awbDetails.awbNumber || 'N/A'}`, margin.left, y);
    doc.text(`Order ID: ${awbDetails.orderId || 'N/A'}`, pageWidth - margin.right, y, { align: 'right' });
    y += 6;
    doc.text(`Courier: ${awbDetails.courier || 'N/A'}`, margin.left, y);
    doc.text(`Date: ${awbDetails.date || new Date().toLocaleDateString()}`, pageWidth - margin.right, y, { align: 'right' });
    y += 8;

    // Table Data
    const tableRows = [
        ["From (Sender)", awbDetails.senderName || '', awbDetails.senderAddress || '', awbDetails.senderPhone || ''],
        ["To (Receiver)", awbDetails.receiverName || '', awbDetails.receiverAddress || '', awbDetails.receiverPhone || ''],
        ["Product", awbDetails.contents || '', awbDetails.weight ? `${awbDetails.weight} kg` : '', awbDetails.dimensions || ''],
        ["Price", awbDetails.price || '', '', ''],
        ["Payment Method", awbDetails.paymentMethod || '', '', ''],
    ];

    autoTable(doc, {  
        startY: y,
        head: [["Type", "Name/Details", "Address/Weight", "Phone/Dimensions"]],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold' },
        margin: { left: margin.left, right: margin.right },
        columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 38 },
            2: { cellWidth: 18 },
            3: { cellWidth: 18 }
        }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('This is a system-generated AWB bill.', pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });

    return doc;
};

export const downloadAwbBill = (awbDetails) => {
    const doc = generateAwbBill(awbDetails);
    doc.save(`AWB_${awbDetails.awbNumber || awbDetails.orderId || 'bill'}.pdf`);
};
