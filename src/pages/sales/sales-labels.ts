export const invoiceStatusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  VALIDATED: "Validée",
  PAID: "Payée",
  CANCELLED: "Annulée",
};

export const paymentStatusLabels: Record<string, string> = {
  UNPAID: "Non payée",
  PARTIAL: "Partiel",
  PAID: "Réglée",
};

export const paymentMethodLabels: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};
