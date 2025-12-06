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
  name: z.string().describe('The name of the location, if available.'),
  formatted_address: z.string().describe('The full, formatted address of the location.'),
  lat: z.number().describe('The latitude of the location.'),
  lng: z.number().describe('The longitude of the location.'),
});
export type VerifyAddressOutput = z.infer<typeof VerifyAddressOutputSchema>;

export async function verifyAddress(input: VerifyAddressInput): Promise<VerifyAddressOutput> {
  return verifyAddressFlow(input);
}

const searchMaps = ai.defineTool({
  name: 'searchMaps',
  description: 'Calls Google Places API to find and verify an address. Returns name, formatted address, and latitude/longitude.',
  inputSchema: z.object({
    query: z.string().describe('The search query for the address, e.g., "1600 Amphitheatre Parkway, Mountain View, CA".'),
  }),
  outputSchema: VerifyAddressOutputSchema,
},
async (input) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === "YOUR_API_KEY") {
    throw new Error("Google Maps API key is not configured. Please add it to your .env.local file.");
  }

  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(input.query)}&inputtype=textquery&fields=formatted_address,name,geometry&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.candidates && data.candidates.length > 0) {
      const place = data.candidates[0];
      return {
        name: place.name,
        formatted_address: place.formatted_address,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
      };
    } else {
      throw new Error(`Google Maps API returned status: ${data.status}. This may be due to an invalid or restricted API key.`);
    }
  } catch (error) {
    console.error('Error fetching data from Google Maps API:', error);
    throw new Error('Failed to verify address with Google Maps.');
  }
});

const verifyAddressPrompt = ai.definePrompt({
  name: 'verifyAddressPrompt',
  tools: [searchMaps],
  input: {schema: VerifyAddressInputSchema},
  output: {schema: VerifyAddressOutputSchema},
  prompt: `Use the searchMaps tool to verify the following address: {{{query}}}. You must call the tool. Do not make up an address. Return the name, formatted_address, lat, and lng of the location.`, 
});

const verifyAddressFlow = ai.defineFlow(
  {
    name: 'verifyAddressFlow',
    inputSchema: VerifyAddressInputSchema,
    outputSchema: VerifyAddressOutputSchema,
  },
  async input => {
    const {output} = await verifyAddressPrompt(input);
    if (!output) {
      throw new Error("The AI failed to return a verified address.");
    }
    return output;
  }
);
