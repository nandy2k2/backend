const mongoose = require('mongoose');

const crmh1schema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: [true, 'Please enter name']
    },
    user: {
        type: String,  // Admin email - matches with user field
        required: [true, 'Please enter user'],
        unique: false
    },
    colid: {
        type: Number,
        required: [true, 'Please enter colid']
    },
    phone: {
        type: String
    },
    email: {
        type: String
    },
    address: {
        type: String
    },
    city: {
        type: String
    },
    state: {
        type: String
    },
    country: {
        type: String
    },
    pin: {
        type: String
    },

    // Academic Info
    qualification: {
        type: String  // 12th pass / Graduate / Post Graduate
    },
    passout_year: {
        type: String
    },
    category: {
        type: String,  // Category name (Nursing / Law / Design / Science)
        required: true
    },
    course_interested: {
        type: String  // Specific course under category
    },
    preferred_mode: {
        type: String  // Hostel / Day Scholar
    },
    expected_admission_year: {
        type: String
    },
    institution: {
        type: String
    },
    program_type: {
        type: String
    },
    program: {
        type: String // Mapped to course_name from programmasterds
    },
    scores_10th: {
        type: String
    },
    scores_12th: {
        type: String
    },
    budget: {
        type: String
    },
    scholarship_interest: {
        type: String  // Yes / No
    },

    // Lead Tracking
    source: {
        type: String,  // Platform where form was filled (Facebook / Instagram / Google Ads / Website / WhatsApp)
        required: true
    },
    form_url: {
        type: String  // The form link that was shared
    },
    source_campaign_id: {
        type: String
    },
    utm_source: {
        type: String
    },
    utm_medium: {
        type: String
    },
    utm_campaign: {
        type: String
    },
    landing_page_url: {
        type: String
    },
    sourceemp: {
        type: String  // Employee who brought the lead
    },

    // Lead Scoring (Auto-calculated)
    lead_score: {
        type: Number,
        default: 0
    },
    lead_temperature: {
        type: String,
        default: 'Cold'  // Hot (>40) / Warm (20-40) / Cold (<20)
    },

    // Assignment (Auto-assigned to counsellor)
    assignedto: {
        type: String,  // Counsellor email (auto-assigned randomly from category)
        required: true
    },
    telecaller: {
        type: String
    },
    telecalleremail: {
        type: String
    },
    telecaller_assigned_date: {
        type: Date
    },
    campusvisitcounselor: {
        type: String
    },
    campusvisitcounseloremail: {
        type: String
    },
    campus_visit_assigned_date: {
        type: Date
    },
    assigned_date: {
        type: Date,
        default: Date.now
    },
    reassignment_count: {
        type: Number,
        default: 0
    },

    // Status & Pipeline
    pipeline_stage: {
        type: String,
        default: 'New Lead'  // New Lead / Contacted / Qualified / Counselling Scheduled / Campus Visited / Application Sent / Application Submitted / Fee Paid / Admitted / Lost / Prospect / Contact Attempted / Phone Conversation / WhatsApp Conversation / Follow Up / General Enquiry / Call Reschedule / Interested / Not Interested / Seat Booked / ePravesh Done / Admission Done / Admission Cancelled / Admited in Another College / Consultancy Services / Enquiry for 2nd year / Enquiry for 3rd year / Enquiry for 4th year Hons. / Existing Student / Hospital Enquiry / Junk Lead / Wrong Number / Not Done Enquiry / Not Eligible / Offer Letter Issued / Other Courses / Prospect for next academic year / ERP Done
    },
    leadstatus: {
        type: String,
        default: 'Active'  // Active / Converted / Lost
    },
    lost_reason: {
        type: String
    },
    leadtype: {
        type: String
    },

    // Follow-up
    last_contact_date: {
        type: Date
    },
    followupdate: {
        type: Date
    },
    next_followup_date: {
        type: Date
    },
    fcomments: {
        type: String
    },

    // Campus Visit
    campus_visit_date: {
        type: Date
    },
    campus_visit_completed: {
        type: String,
        default: 'No'  // Yes / No
    },
    counselling_session_booked: {
        type: String,
        default: 'No'  // Yes / No
    },

    // Documents
    documents_uploaded: [{
        document_type: String,
        document_url: String,
        uploaded_date: Date
    }],
    marksheet_10th_url: {
        type: String
    },
    marksheet_12th_url: {
        type: String
    },

    // Application
    application_form_sent: {
        type: String,
        default: 'No'
    },
    application_form_sent_date: {
        type: Date
    },
    application_submitted: {
        type: String,
        default: 'No'
    },
    application_submitted_date: {
        type: Date
    },

    // Drip Campaign
    enrolled_drip_campaign: {
        type: String  // Campaign ID
    },
    drip_campaign_status: {
        type: String  // Active / Paused / Completed
    },

    // Engagement Tracking (for lead scoring)
    brochure_downloaded: {
        type: String,
        default: 'No'
    },
    fee_details_requested: {
        type: String,
        default: 'No'
    },

    // Legacy Fields
    lead: {
        type: String
    },
    company: {
        type: String
    },
    designation: {
        type: String
    },
    year: {
        type: String
    },
    product: {
        type: String
    },
    amount: {
        type: Number
    },
    status1: {
        type: String
    },
    comments: {
        type: String
    },

    // Custom Fields (Dynamic user-defined fields)
    custom_fields: [{
        field_name: {
            type: String,
            required: true
        },
        field_type: {
            type: String,
            default: 'Text'  // Text, Dropdown, Date, Number
        },
        field_options: [String],     // For Dropdown type
        field_value: {
            type: mongoose.Schema.Types.Mixed  // Accepts any data type
        }
    }]
}, {
    timestamps: true
});

const crmh1 = mongoose.model('crmh1', crmh1schema);
module.exports = crmh1;
