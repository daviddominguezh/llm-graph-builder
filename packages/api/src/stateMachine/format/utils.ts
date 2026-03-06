import { logger } from '@globalUtils/logger.js';

import { DEFAULT_EMPTY_COUNT, FIRST_INDEX, TOKEN_PREVIEW_LENGTH } from '@constants/index.js';

import type { Context } from '@globalTypes/ai/tools.js';
import { PAYMENT_METHOD } from '@globalTypes/business/payments.js';

// Payment method translations to Spanish
const PAYMENT_METHOD_TRANSLATIONS: Record<PAYMENT_METHOD, string> = {
  [PAYMENT_METHOD.ONLINE]: 'pago en linea',
  [PAYMENT_METHOD.ON_DELIVERY]: 'pago contra-entrega',
  [PAYMENT_METHOD.bancolombia]: 'transferencia a Bancolombia',
  [PAYMENT_METHOD.davivienda]: 'transferencia a Davivienda',
  [PAYMENT_METHOD.banco_bogota]: 'transferencia a Banco Bogota',
  [PAYMENT_METHOD.bbva]: 'transferencia a BBVA',
  [PAYMENT_METHOD.banco_occidente]: 'transferencia a Banco Occidente',
  [PAYMENT_METHOD.banco_popular]: 'transferencia a Banco Popular',
  [PAYMENT_METHOD.scotiabank]: 'transferencia a Scotiabank',
  [PAYMENT_METHOD.banco_agrario]: 'transferencia a Banco Agrario',
  [PAYMENT_METHOD.banco_av_villas]: 'transferencia a banco AV Villas',
  [PAYMENT_METHOD.banco_caja_social]: 'transferencia a Banco Caja Social',
  [PAYMENT_METHOD.nequi]: 'transferencia a Nequi',
  [PAYMENT_METHOD.daviplata]: 'transferencia a Daviplata',
  [PAYMENT_METHOD.llave]: 'transferencia por llave',
};

const PAYMENT_METHOD_VALUES: string[] = Object.values(PAYMENT_METHOD);

const isValidPaymentMethod = (value: string): value is PAYMENT_METHOD =>
  PAYMENT_METHOD_VALUES.includes(value);

const logCatalogUrlBuilding = (
  logKey: string,
  context: Context,
  configuredWebsite: string | undefined,
  baseUrl: string
): void => {
  const hasConfiguredWebsite = configuredWebsite !== undefined && configuredWebsite !== '';
  const hasUserToken = context.userToken !== undefined && context.userToken !== '';
  const userTokenLength = context.userToken?.length ?? DEFAULT_EMPTY_COUNT;
  const userTokenPreview = hasUserToken
    ? `${context.userToken?.substring(FIRST_INDEX, TOKEN_PREVIEW_LENGTH) ?? ''}...`
    : '(none)';

  logger.info(`${logKey}Building catalog URL`, {
    namespace: context.namespace,
    userID: context.userID,
    hasConfiguredWebsite,
    configuredWebsite: configuredWebsite ?? '(not set)',
    usingDefaultUrl: !hasConfiguredWebsite,
    baseUrl,
    hasUserToken,
    userTokenLength,
    userTokenPreview,
  });
};

export const buildCatalogUrl = (context: Context): string => {
  const logKey = `buildCatalogUrl/${context.namespace}| `;

  const {
    businessSetup: {
      info: { website: configuredWebsite },
    },
  } = context;
  const defaultUrl = `https://${context.namespace}.usecloser.ai/`;
  const baseUrl = configuredWebsite === '' ? defaultUrl : configuredWebsite;

  logCatalogUrlBuilding(logKey, context, configuredWebsite, baseUrl);

  if (context.userToken === undefined || context.userToken === '') {
    logger.info(`${logKey}No user token available, returning base URL without token`, {
      finalUrl: baseUrl,
    });
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  const finalUrl = `${baseUrl}${separator}ut=${context.userToken}`;

  logger.info(`${logKey}User token appended to URL`, {
    baseUrlHadQueryParams: baseUrl.includes('?'),
    separator,
    finalUrl,
    tokenFirstChars: `${context.userToken.substring(FIRST_INDEX, TOKEN_PREVIEW_LENGTH)}...`,
  });

  return finalUrl;
};

const getPaymentMethodTranslation = (value: string): string => {
  if (isValidPaymentMethod(value)) {
    return PAYMENT_METHOD_TRANSLATIONS[value];
  }
  return value;
};

const buildPaymentMethodsString = (pm: string[], transferences: string[]): string => {
  if (pm.length === FIRST_INDEX && transferences.length === FIRST_INDEX) {
    return 'No hay ningun metodo de pago disponible y tampoco se puede pagar con ningun tipo de transferencia';
  }

  if (pm.length === FIRST_INDEX) {
    return `Unicamente se aceptan transferencias a ${transferences.join(' y ')}`;
  }

  let pmStr = pm.join(' y ');
  if (transferences.length > FIRST_INDEX) {
    pmStr += `, ademas, se puede pagar con transferencias a ${transferences.join(' y ')}`;
  } else {
    pmStr += ', ademas, NO puede pagar con ningun tipo de transferencia, solo con los metodos ya mencionados';
  }
  return pmStr;
};

export const insertValuesInText = (context: Context, str: string): string => {
  const pm = context.businessSetup.paymentMethods.acceptedMethods.map((m) =>
    getPaymentMethodTranslation(m.value)
  );
  const transferences = (context.businessSetup.paymentMethods.transferences ?? []).map(
    (m) => `"${m.bank} al numero de cuenta:${m.bankAccount}\n\n"`
  );

  const pmStr = buildPaymentMethodsString(pm, transferences);

  const values: Record<string, string | undefined> = {
    '{BOT_NAME}': 'Macarena',
    '{BUSINESS_NAME}': context.businessSetup.info.businessName,
    '{BUSINESS_DESCRIPTION}': context.businessSetup.info.businessDescription,
    '{USER_NAME}': context.userName,
    '{CATALOG_URL}': buildCatalogUrl(context),
    '{PAYMENT_METHODS}': pmStr,
  };
  let res = str;
  Object.keys(values).forEach((key) => {
    const { [key]: val } = values;
    if (val !== undefined && val !== '') {
      res = res.replaceAll(key, val);
    }
  });
  return res;
};
