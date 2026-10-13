const hdfcpaymentorderds = require('../Models/hdfcpaymentorderds');
const hdfcgatewayds = require('../Models/hdfcgatewayds');
const platformchargesds = require('../Models/platformchargesds');
const Coupon = require('../Models/couponds');
const { HDFCPaymentHandler, HDFCAPIException } = require('../utils/hdfcpaymenthandler');
const crypto = require('crypto');
const Ledgerstud = require('../Models/ledgerstud');
const text = (value) => String(value ?? '').trim();
const isKharabilluCoupon = (value) => text(value).toLowerCase() === 'kharabillu';

// Create HDFC payment order
exports.createhdfcpaymentorderdsdatabyds = async (req, res) => {
  try {
    const {
      name,
      user,
      colid,
      studentName,
      regno,
      studentEmail,
      studentPhone,
      originalAmount,
      paymentType,
      paymentPurpose,
      academicYear,
      semester,
      course,
      department,
      programcode,
      admissionyear,
      couponCode,
      feegroup,
      feeitem,
      feecategory,
      installment,
      frontendCallbackUrl,
      backendReturnUrl,
      comments,
      notes
    } = req.body;

    // Validate required fields
    if (!studentName || !regno || !studentEmail || !studentPhone || !originalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: studentName, regno, studentEmail, studentPhone, originalAmount'
      });
    }

    // Validate URLs
    if (!frontendCallbackUrl || !backendReturnUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required URLs: frontendCallbackUrl, backendReturnUrl'
      });
    }

    // Parse and validate amount
    const parsedamount = parseFloat(originalAmount);
    if (isNaN(parsedamount) || parsedamount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Fetch HDFC gateway configuration
    const gatewayconfig = await hdfcgatewayds.findOne({
      colid,
      isactive: true
    });

    if (!gatewayconfig) {
      return res.status(404).json({
        success: false,
        message: 'HDFC gateway not configured or inactive for this institution'
      });
    }

    // Calculate platform charges
    let platformcharges = 0;
    try {
      const chargesconfig = await platformchargesds.findOne({
        colid,
        isActive: true
      });

      if (chargesconfig) {
        const basecharge = chargesconfig.chargetype === 'Fixed'
          ? chargesconfig.fixedcharge
          : (parsedamount * chargesconfig.percentagecharge / 100);

        const finalcharge = Math.max(
          chargesconfig.minimumcharge || 0,
          Math.min(basecharge, chargesconfig.maximumcharge || basecharge)
        );

        platformcharges = chargesconfig.gstApplicable
          ? finalcharge + (finalcharge * chargesconfig.gstPercentage / 100)
          : finalcharge;
      }
    } catch (err) {
      // // console.log('Platform charges not configured:', err.message);
    }

    // Handle coupon
    let discount = 0;
    let couponid = null;
    let couponapplied = false;

    if (isKharabilluCoupon(couponCode)) {
      discount = Math.max(0, parsedamount + platformcharges - 1);
      couponapplied = true;
    } else if (couponCode) {
      try {
        const coupon = await Coupon.findOne({
          couponCode: couponCode.toUpperCase(),
          colid
        });

        if (coupon) {
          const studentinfo = { course, department, semester, programcode };
          const validation = coupon.validateCoupon(regno, parsedamount, paymentType, studentinfo);

          if (validation.valid) {
            discount = coupon.calculateDiscount(parsedamount);
            couponid = coupon._id.toString();
            couponapplied = true;
          }
        }
      } catch (err) {
        // // console.log('Coupon validation failed:', err.message);
      }
    }

    // Calculate final amount
    const finalamount = Math.round(parsedamount - discount + platformcharges);

    // Generate unique IDs
    const timestamp = Date.now();
    const randomstr = Math.random().toString(36).substr(2, 9);
    const orderid = `ORD_HDFC_${colid}_${timestamp}_${randomstr}`;
    const merchanttransactionid = `TXN_HDFC_${colid}_${timestamp}_${randomstr}`;

    // Create payment order in database
    const neworder = new hdfcpaymentorderds({
      name: name || 'HDFC Payment Gateway',
      user: user || studentEmail,
      colid,
      student: studentName,
      regno,
      studentemail: studentEmail,
      studentphone: studentPhone,
      orderid: orderid,
      merchanttransactionid: merchanttransactionid,
      originalamount: parsedamount,
      discount,
      platformcharges: platformcharges,
      amount: finalamount,
      paymenttype: paymentType || 'OTHER',
      paymentpurpose: paymentPurpose || 'Fee Payment',
      academicyear: academicYear,
      semester,
      course,
      department,
      programcode,
      admissionyear,
      couponapplied: couponapplied,
      couponcode: couponapplied ? couponCode.toUpperCase() : null,
      couponid: couponid,
      status: 'INITIATED',
      initiatedat: new Date(),
      expiresat: new Date(Date.now() + 30 * 60 * 1000),
      redirecturl: backendReturnUrl,
      frontendcallbackurl: frontendCallbackUrl,
      callbackurl: gatewayconfig.callbackurl,
      feegroup,
      feeitem,
      feecategory,
      installment,
      comments,
      notes
    });

    await neworder.save();

    // Apply coupon usage
    if (couponapplied && couponid) {
      try {
        const coupon = await Coupon.findById(couponid);
        await coupon.applyCoupon(studentName, regno, orderid, discount);
      } catch (err) {
        // // console.log('Coupon apply failed:', err.message);
      }
    }

    // Prepare HDFC payment request
    const sessionparams = {
      order_id: merchanttransactionid,
      amount: finalamount,
      currency: 'INR',
      customer_id: regno,
      customer_email: studentEmail,
      customer_phone: studentPhone,
      return_url: backendReturnUrl,
      order_note: paymentPurpose || 'Fee Payment'
    };

    // Initialize HDFC Payment Handler
    const handler = HDFCPaymentHandler.getinstance(gatewayconfig);

    try {
      // Create order session
      const sessionresponse = await handler.createordersession(sessionparams);

      // Check if payment URL is available
      if (sessionresponse && sessionresponse.payment_links && sessionresponse.payment_links.web) {
        // Update order with HDFC details
        neworder.hdfcorderid = sessionresponse.order_id || sessionresponse.id;
        neworder.hdfcpaymenturl = sessionresponse.payment_links.web;
        neworder.state = sessionresponse.status || 'INITIATED';
        neworder.paymentdetails = sessionresponse;
        await neworder.save();

        return res.status(201).json({
          success: true,
          message: 'HDFC payment initiated successfully',
          data: {
            orderid: orderid,
            merchanttransactionid: merchanttransactionid,
            originalamount: parsedamount,
            discount,
            platformcharges: platformcharges,
            finalamount: finalamount,
            paymenturl: sessionresponse.payment_links.web,
            order: neworder
          }
        });
      } else {
        throw new Error('No payment URL received from HDFC');
      }
    } catch (hdfcerror) {
      //console.error('HDFC API Error:', hdfcerror);

      // Update order status to failed
      neworder.status = 'FAILED';
      neworder.errordetails = hdfcerror;
      neworder.failedat = new Date();
      await neworder.save();

      if (hdfcerror instanceof HDFCAPIException) {
        const statuscode = (hdfcerror.httpresponsecode > 0 && hdfcerror.httpresponsecode < 600)
          ? hdfcerror.httpresponsecode
          : 500;

        return res.status(statuscode).json({
          success: false,
          message: 'HDFC payment initiation failed',
          error: {
            status: hdfcerror.status,
            errorcode: hdfcerror.errorcode,
            errormessage: hdfcerror.errormessage
          }
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to initiate payment with HDFC',
        error: hdfcerror.message
      });
    }
  } catch (err) {
    // // console.error('Create HDFC Order Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

// Check HDFC payment status
exports.checkhdfcpaymentstatusbyds = async (req, res) => {
  try {
    const { merchantOrderId, colid } = req.query;

    if (!merchantOrderId || !colid) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: merchantOrderId, colid'
      });
    }

    // Fetch order from database
    const order = await hdfcpaymentorderds.findOne({
      orderid: merchantOrderId,
      colid
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Fetch gateway configuration
    const gatewayconfig = await hdfcgatewayds.findOne({
      colid,
      isactive: true
    });

    if (!gatewayconfig) {
      return res.status(404).json({
        success: false,
        message: 'HDFC gateway configuration not found'
      });
    }

    // Initialize HDFC Payment Handler
    const handler = HDFCPaymentHandler.getinstance(gatewayconfig);

    try {
      // Check order status with HDFC
      const statusresponse = await handler.checkorderstatus(order.merchanttransactionid);

      // Update order based on status
      const orderstatus = statusresponse.status;

      if (orderstatus === 'CHARGED') {
        order.status = 'SUCCESS';
        order.state = 'CHARGED';
        order.hdfctransactionid = statusresponse.txn_id || statusresponse.transaction_id;
        order.paymentmode = statusresponse.payment_method_type || statusresponse.payment_instrument?.type;
        order.paymentdetails = statusresponse;
        order.completedat = new Date();

        // Create ledger entry if not already created
        if (!order.ledgerentrycreated) {
          try {
            const ledgerEntry = new Ledgerstud({
              name: order.name,
              user: order.user,
              feegroup: order.feegroup || "Payment",
              regno: order.regno,
              student: order.student,
              feeitem: order.feeitem || "Payment",
              feecategory: order.feecategory || "Payment",
              amount: -Math.abs(order.originalamount),
              paymode: 'HDFC',
              paydetails: order.hdfctransactionid || order.merchanttransactionid,
              type: "negative",
              semester: order.semester,
              installment: order.installment,
              comments: `Payment via HDFC Order ${order.orderid}`,
              academicyear: order.academicyear,
              classdate: new Date(),
              status: "paid",
              colid: order.colid,
              programcode: order.programcode,
              admissionyear: order.admissionyear,
            });
            await ledgerEntry.save();
            order.ledgerentrycreated = true;
            order.ledgerentryid = ledgerEntry._id;
            // order saved below
          } catch (ledgerError) {
            console.error("Error creating ledger entry:", ledgerError);
          }
        }
      } else if (orderstatus === 'PENDING' || orderstatus === 'PENDING_VBV') {
        order.status = 'PENDING';
        order.state = orderstatus;
      } else if (orderstatus === 'AUTHORIZATION_FAILED') {
        order.status = 'FAILED';
        order.state = 'AUTHORIZATION_FAILED';
        order.errordetails = statusresponse;
        order.failedat = new Date();
      } else if (orderstatus === 'AUTHENTICATION_FAILED') {
        order.status = 'FAILED';
        order.state = 'AUTHENTICATION_FAILED';
        order.errordetails = statusresponse;
        order.failedat = new Date();
      } else {
        order.status = orderstatus;
        order.state = orderstatus;
        order.paymentdetails = statusresponse;
      }

      await order.save();

      return res.status(200).json({
        success: true,
        data: {
          status: order.status,
          details: statusresponse
        }
      });
    } catch (hdfcerror) {
      // // console.error('HDFC Status Check Error:', hdfcerror);

      if (hdfcerror instanceof HDFCAPIException) {
        return res.status(hdfcerror.httpresponsecode || 500).json({
          success: false,
          message: 'Failed to check HDFC payment status',
          error: {
            status: hdfcerror.status,
            errorcode: hdfcerror.errorcode,
            errormessage: hdfcerror.errormessage
          }
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to check payment status',
        error: hdfcerror.message
      });
    }
  } catch (err) {
    // // console.error('Check Status Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

// Get single HDFC payment order
exports.gethdfcpaymentorderdsdatabyds = async (req, res) => {
  try {
    const { orderid, colid } = req.query;

    if (!orderid || !colid) {
      return res.status(400).json({
        success: false,
        message: 'orderid and colid are required'
      });
    }

    const order = await hdfcpaymentorderds.findOne({ orderid, colid });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    // // console.error('Get Order Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: err.message
    });
  }
};

// Get all HDFC payment orders
exports.getallhdfcpaymentorderdsdatabyds = async (req, res) => {
  try {
    const { colid, status, regno, startDate, endDate, page = 1, limit = 50 } = req.body;

    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    // Build query
    const query = { colid };

    if (status) {
      query.status = status;
    }

    if (regno) {
      query.regno = regno;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await hdfcpaymentorderds
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalcount = await hdfcpaymentorderds.countDocuments(query);

    return res.status(200).json({
      success: true,
      count: orders.length,
      totalcount,
      page: parseInt(page),
      totalpages: Math.ceil(totalcount / parseInt(limit)),
      data: orders
    });
  } catch (err) {
    // // console.error('Get All Orders Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: err.message
    });
  }
};

// Update HDFC payment order
exports.updatehdfcpaymentorderdsdatabyds = async (req, res) => {
  try {
    const { orderid, colid } = req.query;
    const updatedata = req.body;

    if (!orderid || !colid) {
      return res.status(400).json({
        success: false,
        message: 'orderid and colid are required'
      });
    }

    const order = await hdfcpaymentorderds.findOne({ orderid, colid });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update allowed fields
    const allowedfields = ['comments', 'notes', 'status'];
    allowedfields.forEach(field => {
      if (updatedata[field] !== undefined) {
        order[field] = updatedata[field];
      }
    });

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      data: order
    });
  } catch (err) {
    // // console.error('Update Order Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: err.message
    });
  }
};

// Delete/Cancel HDFC payment order
exports.deletehdfcpaymentorderdsdatabyds = async (req, res) => {
  try {
    const { orderid, colid } = req.query;

    if (!orderid || !colid) {
      return res.status(400).json({
        success: false,
        message: 'orderid and colid are required'
      });
    }

    const order = await hdfcpaymentorderds.findOne({ orderid, colid });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Soft delete - update status to CANCELLED
    if (order.status === 'INITIATED' || order.status === 'PENDING') {
      order.status = 'CANCELLED';
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel order in current status'
      });
    }
  } catch (err) {
    // // console.error('Delete Order Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: err.message
    });
  }
};

// Initiate HDFC refund
exports.initiatehdfcrefundbyds = async (req, res) => {
  try {
    const { orderid, colid, amount, reason } = req.body;

    if (!orderid || !colid || !amount) {
      return res.status(400).json({
        success: false,
        message: 'orderid, colid, and amount are required'
      });
    }

    const order = await hdfcpaymentorderds.findOne({ orderid, colid });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund successful payments'
      });
    }

    // Fetch gateway configuration
    const gatewayconfig = await hdfcgatewayds.findOne({
      colid,
      isactive: true
    });

    if (!gatewayconfig) {
      return res.status(404).json({
        success: false,
        message: 'HDFC gateway configuration not found'
      });
    }

    // Generate unique refund request ID
    const refundrequestid = `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const refundparams = {
      order_id: order.merchanttransactionid,
      amount: parseFloat(amount) * 100, // Amount in paise
      unique_request_id: refundrequestid
    };

    // Initialize HDFC Payment Handler
    const handler = HDFCPaymentHandler.getinstance(gatewayconfig);

    try {
      const refundresponse = await handler.initiaterefund(refundparams);

      // Update order with refund details
      order.refund = refundresponse;
      order.refundstatus = refundresponse.status;
      order.refundamount = parseFloat(amount);
      order.refundrequestid = refundrequestid;
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Refund initiated successfully',
        data: {
          orderid: order.orderid,
          refundrequestid: refundrequestid,
          refundstatus: refundresponse.status,
          refundresponse: refundresponse
        }
      });
    } catch (hdfcerror) {
      // // console.error('HDFC Refund Error:', hdfcerror);

      if (hdfcerror instanceof HDFCAPIException) {
        return res.status(hdfcerror.httpresponsecode || 500).json({
          success: false,
          message: 'HDFC refund initiation failed',
          error: {
            status: hdfcerror.status,
            errorcode: hdfcerror.errorcode,
            errormessage: hdfcerror.errormessage
          }
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to initiate refund',
        error: hdfcerror.message
      });
    }
  } catch (err) {
    // // console.error('Refund Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

// HDFC Webhook handler
exports.hdfcwebhookhandler = async (req, res) => {
  try {
    const callbackdata = req.body;

    // Validate signature
    const orderid = callbackdata.order_id || callbackdata.orderid;

    if (!orderid) {
      return res.status(400).json({
        success: false,
        message: 'Order ID missing in webhook'
      });
    }

    // Find order
    const order = await hdfcpaymentorderds.findOne({
      merchanttransactionid: orderid
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Fetch gateway config for signature validation
    const gatewayconfig = await hdfcgatewayds.findOne({
      colid: order.colid,
      isactive: true
    });

    if (!gatewayconfig) {
      return res.status(404).json({
        success: false,
        message: 'Gateway configuration not found'
      });
    }

    // Validate HMAC signature
    try {
      const isvalid = HDFCPaymentHandler.validatehmacsignature(
        callbackdata,
        gatewayconfig.responsekey
      );

      if (!isvalid) {
        // // console.error('HDFC Webhook signature validation failed');
        return res.status(400).json({
          success: false,
          message: 'Signature validation failed'
        });
      }
    } catch (signatureerror) {
      // // console.error('Signature validation error:', signatureerror);
      return res.status(400).json({
        success: false,
        message: 'Signature validation error'
      });
    }

    // Update order status based on webhook data
    const status = callbackdata.status;

    if (status === 'CHARGED') {
      order.status = 'SUCCESS';
      order.completedat = new Date();
    } else if (status === 'FAILED' || status === 'AUTHORIZATION_FAILED' || status === 'AUTHENTICATION_FAILED') {
      order.status = 'FAILED';
      order.failedat = new Date();
    } else {
      order.status = status;
    }

    order.state = status;
    order.paymentdetails = callbackdata;

    // Create ledger entry if success and not created
    if (order.status === 'SUCCESS' && !order.ledgerentrycreated) {
      try {
        const ledgerEntry = new Ledgerstud({
          name: order.name,
          user: order.user,
          feegroup: order.feegroup || "Payment",
          regno: order.regno,
          student: order.student,
          feeitem: order.feeitem || "Payment",
          feecategory: order.feecategory || "Payment",
          amount: -Math.abs(order.originalamount),
          paymode: 'HDFC',
          paydetails: order.hdfctransactionid || order.merchanttransactionid,
          type: "negative",
          semester: order.semester,
          installment: order.installment,
          comments: `Payment via HDFC Order ${order.orderid}`,
          academicyear: order.academicyear,
          classdate: new Date(),
          status: "paid",
          colid: order.colid,
          programcode: order.programcode,
          admissionyear: order.admissionyear,
        });
        await ledgerEntry.save();
        order.ledgerentrycreated = true;
        order.ledgerentryid = ledgerEntry._id;
      } catch (ledgerError) {
        console.error("Error creating ledger entry in webhook:", ledgerError);
      }
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (err) {
    // // console.error('Webhook Handler Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: err.message
    });
  }
};
// HDFC Return URL handler - Handles POST from HDFC after payment
exports.hdfcreturnurlhandler = async (req, res) => {
  try {
    const callbackdata = req.body;
    const hdfcorderid = callbackdata.order_id || callbackdata.orderid;

    if (!hdfcorderid) {
      return res.status(400).send('Order ID missing');
    }

    const order = await hdfcpaymentorderds.findOne({
      merchanttransactionid: hdfcorderid
    });

    if (!order) {
      return res.status(404).send('Order not found');
    }

    const gatewayconfig = await hdfcgatewayds.findOne({
      colid: order.colid,
      isactive: true
    });

    if (gatewayconfig) {
      try {
        const handler = HDFCPaymentHandler.getinstance(gatewayconfig);

        const statusresponse = await handler.checkorderstatus(hdfcorderid);

        // Update order with verified status
        if (statusresponse && statusresponse.status) {
          order.status = statusresponse.status === 'CHARGED' ? 'SUCCESS' :
            statusresponse.status === 'FAILED' ? 'FAILED' :
              statusresponse.status;
          order.state = statusresponse.status;
          order.hdfctransactionid = statusresponse.txn_id || statusresponse.cf_payment_id;
          order.paymentmode = statusresponse.payment_method || statusresponse.payment_group;
          order.paymentdetails = statusresponse;

          if (statusresponse.status === 'CHARGED') {
            order.completedat = new Date();
          } else if (statusresponse.status === 'FAILED') {
            order.failedat = new Date();
          }
        }
      } catch (apierror) {
        // Fallback to callback data
        order.status = callbackdata.status === 'CHARGED' ? 'SUCCESS' : callbackdata.status;
        order.paymentdetails = callbackdata;
      }
    } else {
      // No gateway config - use callback data
      order.status = callbackdata.status === 'CHARGED' ? 'SUCCESS' : callbackdata.status;
      order.paymentdetails = callbackdata;
    }

    // Create ledger entry if success and not created
    if (order.status === 'SUCCESS' && !order.ledgerentrycreated) {
      try {
        const ledgerEntry = new Ledgerstud({
          name: order.name,
          user: order.user,
          feegroup: order.feegroup || "Payment",
          regno: order.regno,
          student: order.student,
          feeitem: order.feeitem || "Payment",
          feecategory: order.feecategory || "Payment",
          amount: -Math.abs(order.originalamount),
          paymode: 'HDFC',
          paydetails: order.hdfctransactionid || order.merchanttransactionid,
          type: "negative",
          semester: order.semester,
          installment: order.installment,
          comments: `Payment via HDFC Order ${order.orderid}`,
          academicyear: order.academicyear,
          classdate: new Date(),
          status: "paid",
          colid: order.colid,
          programcode: order.programcode,
          admissionyear: order.admissionyear,
        });
        await ledgerEntry.save();
        order.ledgerentrycreated = true;
        order.ledgerentryid = ledgerEntry._id;
      } catch (ledgerError) {
        console.error("Error creating ledger entry in return handler:", ledgerError);
      }
    }

    await order.save();

    const frontendurl = order.frontendcallbackurl
      ? `${order.frontendcallbackurl}?merchantOrderId=${order.orderid}&colid=${order.colid}&status=${order.status}`
      : `/error?message=Frontend callback URL not configured`;

    return res.redirect(frontendurl);

  } catch (err) {
    // // console.error('Return URL Handler Error:', err);
    return res.status(500).send('Payment processing failed');
  }
};
