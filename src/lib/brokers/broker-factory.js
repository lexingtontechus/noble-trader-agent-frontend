/**
 * Broker Factory — resolves the correct broker adapter based on
 * broker ID and credentials.
 *
 * Usage:
 *   import { createBroker, getBrokerIdFromCredentialType } from '@/lib/brokers/broker-factory';
 *   const broker = createBroker({ brokerId: 'alpaca_paper', credentials: { apiKey, secretKey } });
 *   const { data, error } = await broker.getAccount();
 */

import { createAlpacaBroker } from './alpaca-adapter';
import { BROKER_IDS } from './index';

/**
 * Create a broker adapter for the given broker ID and credentials.
 *
 * @param {object} config
 * @param {string} config.brokerId — One of BROKER_IDS values (e.g., 'alpaca_paper')
 * @param {object} config.credentials — Broker-specific credentials
 * @param {string} config.credentials.apiKey — API key
 * @param {string} config.credentials.secretKey — Secret key
 * @returns {object} Broker adapter implementing all BROKER_METHODS
 * @throws {Error} If brokerId is unknown or credentials are missing
 */
export function createBroker({ brokerId, credentials }) {
  if (!brokerId) {
    throw new Error('brokerId is required');
  }

  if (!credentials?.apiKey || !credentials?.secretKey) {
    throw new Error('Credentials (apiKey, secretKey) are required');
  }

  switch (brokerId) {
    case BROKER_IDS.ALPACA_PAPER:
    case BROKER_IDS.ALPACA_LIVE:
      return createAlpacaBroker({
        apiKey: credentials.apiKey,
        secretKey: credentials.secretKey,
        mode: brokerId === BROKER_IDS.ALPACA_LIVE ? 'live' : 'paper',
      });

    // Future brokers:
    // case BROKER_IDS.IBKR:
    //   return createIbkrBroker(credentials);

    default:
      throw new Error(
        `Unknown broker: "${brokerId}". Supported brokers: ${Object.values(BROKER_IDS).join(', ')}`
      );
  }
}

/**
 * Map a credential type ('paper' | 'live') to a broker ID.
 * This is the primary bridge between the existing credential system
 * and the new broker abstraction.
 *
 * @param {"paper"|"live"} credentialType
 * @returns {string} Broker ID (e.g., 'alpaca_paper')
 */
export function getBrokerIdFromCredentialType(credentialType) {
  if (credentialType === 'live') {
    return BROKER_IDS.ALPACA_LIVE;
  }
  return BROKER_IDS.ALPACA_PAPER;
}

/**
 * Check if a broker ID is supported.
 *
 * @param {string} brokerId
 * @returns {boolean}
 */
export function isSupportedBroker(brokerId) {
  return Object.values(BROKER_IDS).includes(brokerId);
}
