'use server';
/**
 * @fileOverview Implements address verification using Google Maps API.
 *
 * - verifyAddress - A function that verifies an address and returns structured address data.
 * - VerifyAddressInput - The input type for the verifyAddress function, including a query string.
 * - VerifyAddressOutput - The return type for the verifyAddress function, providing structured address details.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VerifyAddressInputSchema = z.object({
  query: z.string().describe('The address query string to verify.'),
});
export type VerifyAddressInput = z.infer<typeof VerifyAddressInputSchema>;

const VerifyAddressOutputSchema = z.object({
  name: z.string().describe('The name of the location.'),
  address: z.string().describe('The formatted address of the location.'),
  latitude: z.number().describe('The latitude of the location.'),
  longitude: z.number().describe('The longitude of the location.'),
});
export type VerifyAddressOutput = z.infer<typeof VerifyAddressOutputSchema>;

export async function verifyAddress(input: VerifyAddressInput): Promise<VerifyAddressOutput> {
  return verifyAddressFlow(input);
}

const searchMaps = ai.defineTool({
  name: 'searchMaps',
  description: 'Calls Google Places API, returns name/address/lat/lng.',
  inputSchema: z.object({
    query: z.string().describe('The search query for the address.'),
  }),
  outputSchema: z.object({
    name: z.string().describe('The name of the location.'),
    address: z.string().describe('The formatted address of the location.'),
    latitude: z.number().describe('The latitude of the location.'),
    longitude: z.number().describe('The longitude of the location.'),
  }),
},
async (input) => {
  // This is a placeholder implementation.
  // Replace this with the actual Google Places API call.
  // For demonstration purposes, returning dummy data.
  console.log(`searching maps for ${input.query}`);
  return {
    name: `Result for ${input.query}`,
    address: '123 Main St, Anytown, USA',
    latitude: 34.0522,
    longitude: -118.2437,
  };
});

const verifyAddressPrompt = ai.definePrompt({
  name: 'verifyAddressPrompt',
  tools: [searchMaps],
  input: {schema: VerifyAddressInputSchema},
  output: {schema: VerifyAddressOutputSchema},
  prompt: `Use the searchMaps tool to verify the following address: {{{query}}}. Return the name, address, latitude, and longitude of the location.`, 
});

const verifyAddressFlow = ai.defineFlow(
  {
    name: 'verifyAddressFlow',
    inputSchema: VerifyAddressInputSchema,
    outputSchema: VerifyAddressOutputSchema,
  },
  async input => {
    const {output} = await verifyAddressPrompt(input);
    return output!;
  }
);
