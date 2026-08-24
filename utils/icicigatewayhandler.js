const crypto = require('crypto');

class ICICIPaymentHandler {
  constructor(config = {}) {
    this.merchantId = config.merchantId || '';
    this.aggregatorId = config.aggregatorId || '';
    this.secretKey = config.secretKey || '';
    this.env = config.env || 'test';

    this.saleUrl = config.saleUrl || (
      this.env === 'prod'
        ? 'https://pgpay.icicibank.com/pg/api/v2/initiateSale'
        : 'https://pgpayuat.icicibank.com/tsp/pg/api/v2/initiateSale'
    );

    this.commandUrl = config.commandUrl || (
      this.env === 'prod'
        ? 'https://pgpay.icicibank.com/pg/api/command'
        : 'https://pgpayuat.icicibank.com/tsp/pg/api/command'
    );

    this.settlementUrl = config.settlementUrl || (
      this.env === 'prod'
        ? 'https://pgpay.icicibank.com/pg/api/settlementDetails'
        : 'https://pgpayuat.icicibank.com/tsp/pg/api/settlementDetails'
    );
  }

  generateSecureHash(params, fieldOrder) {
    const keys = Array.isArray(fieldOrder) && fieldOrder.length
      ? fieldOrder.filter((key) => Object.prototype.hasOwnProperty.call(params || {}, key))
      : Object.keys(params || {})
      .filter((key) => key !== 'secureHash' && key !== 'securehash')
      .sort();

    const message = keys.reduce((acc, key) => {
      const value = params[key];
      if (value === undefined || value === null) return acc;
      const valueText = value.toString().trim();
      if (!valueText) return acc;
      return acc + valueText;
    }, '');

    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message, 'ascii')
      .digest('hex')
      .toLowerCase();
  }

  verifySecureHash(params) {
    const receivedHash = params.secureHash || params.securehash;
    if (!receivedHash) return false;
    const calculatedHash = this.generateSecureHash(params);
    return calculatedHash === receivedHash.toString().toLowerCase();
  }

  formatTxnDate(date = new Date()) {
    const pad = (num) => num.toString().padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('');
  }

  buildInitiateSalePayload(params) {
    const payload = {
      merchantId: this.merchantId,
      aggregatorID: this.aggregatorId,
      merchantTxnNo: params.merchantTxnNo,
      amount: parseFloat(params.amount).toFixed(2),
      currencyCode: params.currencyCode || '356',
      payType: params.payType || '0',
      customerEmailID: params.customerEmailID || '',
      transactionType: 'SALE',
      returnURL: params.returnURL,
      txnDate: params.txnDate || this.formatTxnDate(),
      customerMobileNo: (params.customerMobileNo || '').toString().replace(/\D/g, '').slice(-10),
      customerName: params.customerName || '',
      addlParam1: params.addlParam1 || '',
      addlParam2: params.addlParam2 || ''
    };

    payload.secureHash = this.generateSecureHash(payload);
    return payload;
  }

  async initiateSale(params) {
    const payload = this.buildInitiateSalePayload(params);
    const response = await fetch(this.saleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid ICICI initiateSale response: ${text}`);
    }

    if (!response.ok) {
      throw new Error(data.respDescription || data.message || `ICICI initiateSale failed with ${response.status}`);
    }

    return { request: payload, response: data };
  }

  getAuthRedirectUrl(initiateResponse) {
    if (!initiateResponse || !initiateResponse.redirectURI || !initiateResponse.tranCtx) {
      return '';
    }
    return `${initiateResponse.redirectURI}?tranCtx=${encodeURIComponent(initiateResponse.tranCtx)}`;
  }

  async command(params) {
    const payload = { ...params };
    payload.secureHash = this.generateSecureHash(payload, [
      'amount',
      'merchantId',
      'merchantTxnNo',
      'originalTxnNo',
      'transactionType'
    ]);

    const response = await fetch(this.commandUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString()
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid ICICI command response: ${text}`);
    }

    if (!response.ok) {
      throw new Error(data.respDescription || data.message || `ICICI command failed with ${response.status}`);
    }

    return { request: payload, response: data };
  }

  checkStatus(merchantTxnNo, originalTxnNo) {
    return this.command({
      merchantId: this.merchantId,
      aggregatorID: this.aggregatorId,
      merchantTxnNo,
      transactionType: 'STATUS',
      originalTxnNo: originalTxnNo || merchantTxnNo
    });
  }

  refund(params) {
    return this.command({
      merchantId: this.merchantId,
      aggregatorID: this.aggregatorId,
      merchantTxnNo: params.merchantTxnNo,
      transactionType: 'REFUND',
      originalTxnNo: params.originalTxnNo,
      amount: parseFloat(params.amount).toFixed(2),
      addlParam1: params.addlParam1 || ''
    });
  }
}

module.exports = ICICIPaymentHandler;
