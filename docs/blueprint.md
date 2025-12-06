# **App Name**: CocoSales AI

## Core Features:

- Authentication & User Roles: Secure user authentication with Firebase Authentication and role-based access control (admin/driver).
- Inventory (Batch Tracking): Manage product inventory with batch tracking, allowing FIFO (First-In-First-Out) stock deduction upon sales.  This tracks which coconuts are sitting in the warehouse
- Client Management (CRM): Manage client information, including contact details, addresses (using Google Maps API), and client-specific pricing overrides (Level 2 Pricing Rule).
- Sales & Invoicing: Create and manage sales transactions and invoices. Apply 'The Pricing Rule' logic, to finalize prices and save to invoice. Optionally, allow manual overrides.
- AI-Powered Voice Interface: Use Gemini 1.5 Flash via Vertex AI SDK, accessible via a mic icon, to handle voice commands for creating invoices and managing inventory, calling external tools where appropriate. Enforces the 'The Pricing Rule': and uses Maps grounding for location verification.
- Transaction History (The Feed): Display a chronological feed of transactions (sales, restocks) in the main dashboard, allowing users to view historical data.
- PDF Invoice Generation: Generate PDF invoices client-side with a professional layout, including company logo, client details, line items, and totals.  Integrate BlobProvider from @react-pdf -> navigator.share(file) to email the PDF invoice

## Style Guidelines:

- Background color: Dark slate (#0F172A) to establish the "Miami Dark" theme.
- Surface color: Medium slate (#1E293B) for cards and UI elements on top of the background.
- Primary action color: Neon Coconut Green (#BEF264) to highlight key actions and the main call to action.
- Text color: Light slate (#F8FAFC) to ensure readability against the dark background.
- Alert color: Orange (#F97316) to visually flag overrides, or manual changes.
- Headline font: 'Space Grotesk' (sans-serif) for a modern and techy look.  Use 'Inter' (sans-serif) for the body.
- Utilize Lucide-React icons throughout the app for a consistent and clean visual experience.
- Implement a mobile-first, responsive layout using Tailwind CSS, with extra-tall inputs (h-14 text-lg) for better usability.
- Incorporate subtle animations and transitions to improve the user experience. Focus animations on feedback to user interaction.