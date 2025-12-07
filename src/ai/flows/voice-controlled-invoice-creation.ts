'use server';

/**
 * @fileOverview A Genkit flow for creating draft invoices using voice commands.
 *
 * - voiceControlledInvoiceCreation - A function that handles the voice-controlled invoice creation process.
 * - VoiceControlledInvoiceCreationInput - The input type for the voiceControlledInvoiceCreation function.
 * - VoiceControlledInvoiceCreationOutput - The return type for the voiceControlledInvoiceCreation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SearchMapsOutputSchema = z.object({
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const CreateInvoiceOutputSchema = z.object({
  invoiceId: z.string(),
});

/**
 * Tool for searching Google Maps for location details.
 */
const SearchMapsToolSchema = ai.defineTool({
  name: 'searchMaps',
  description: 'Calls Google Places API, returns name/address/lat/lng.',
  inputSchema: z.object({
    query: z.string().describe('The search query for the map.'),
  }),
  outputSchema: SearchMapsOutputSchema,
},
async (input) => {
  // Placeholder implementation for searchMaps tool
  console.log("searchMaps tool called with query: " + input.query);
  return { name: 'Sample Location', address: '123 Main St', lat: 34.0522, lng: -118.2437 };
});

/**
 * Tool for creating a draft invoice in the UI state.
 */
const CreateInvoiceToolSchema = ai.defineTool({
  name: 'createInvoice',
  description: 'Updates React State (not database yet) to show a Draft invoice for user confirmation.',
  inputSchema: z.object({
    json: z.string().describe('JSON representation of the invoice data'),
  }),
  outputSchema: CreateInvoiceOutputSchema,
},
async (input) => {
  // Placeholder implementation for createInvoice tool
  console.log("createInvoice tool called with json: " + input.json);
  return { invoiceId: 'sample_invoice_id' };
});


const VoiceControlledInvoiceCreationInputSchema = z.object({
  voiceCommand: z.string().describe('The voice command given by the driver.'),
});
/** Input type for voice controlled invoice creation. */
export type VoiceControlledInvoiceCreationInput = z.infer<typeof VoiceControlledInvoiceCreationInputSchema>;

const VoiceControlledInvoiceCreationOutputSchema = z.object({
  invoiceStatus: z.string().describe('The status of the invoice creation process.'),
});
/** Output type for voice controlled invoice creation. */
export type VoiceControlledInvoiceCreationOutput = z.infer<typeof VoiceControlledInvoiceCreationOutputSchema>;

/**
 * Initiates the voice-controlled invoice creation flow.
 *
 * @param input - The voice command input.
 * @returns The result of the invoice creation process.
 */
export async function voiceControlledInvoiceCreation(input: VoiceControlledInvoiceCreationInput): Promise<VoiceControlledInvoiceCreationOutput> {
  return voiceControlledInvoiceCreationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'voiceControlledInvoiceCreationPrompt',
  input: {schema: VoiceControlledInvoiceCreationInputSchema},
  output: {schema: VoiceControlledInvoiceCreationOutputSchema},
  tools: [SearchMapsToolSchema, CreateInvoiceToolSchema],
  prompt: `You are CocOs, the logistics assistant. Your task is to create invoices based on voice commands.

  RULES:
  1. \"The Pricing Rule\": If the user says a price (e.g. \"for 6 dollars\"), pass it as 'spot_price'. If not, pass 'null'.
  2. Maps Grounding: If the user mentions a new location, call 'searchMaps' to verify the address.
  3. Be concise.

  Voice Command: {{{voiceCommand}}}
  `, 
  system: `You are CocOs, the logistics assistant.
  Tools available: [createInvoice, updateStock, searchMaps].`
});

const voiceControlledInvoiceCreationFlow = ai.defineFlow(
  {
    name: 'voiceControlledInvoiceCreationFlow',
    inputSchema: VoiceControlledInvoiceCreationInputSchema,
    outputSchema: VoiceControlledInvoiceCreationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
