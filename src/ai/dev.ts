import { config } from 'dotenv';
config();

import '@/ai/flows/voice-controlled-invoice-creation.ts';
import '@/ai/flows/maps-based-address-verification.ts';

/**
 * @fileOverview Initializes the development environment for Genkit flows.
 * It loads environment variables and imports the flow definitions.
 */
