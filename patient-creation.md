# Patient Creation Knowledge Base - Salesforce Integration

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Request Flow](#request-flow)
4. [Key Components](#key-components)
5. [Patient Creation Process](#patient-creation-process)
6. [Validation](#validation)
7. [Patient Matching and Merging](#patient-matching-and-merging)
8. [Associated Resources](#associated-resources)
9. [Error Handling](#error-handling)
10. [API Specification](#api-specification)
11. [Examples](#examples)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The Salesforce Patient Creation system is a comprehensive Rails-based integration that handles patient data synchronization between Salesforce and the MDT platform. It provides asynchronous processing, validation, patient matching/merging, and management of associated resources like providers, representatives, and work orders.

### Key Features
- ✅ Asynchronous job processing with high-priority queue
- ✅ Patient matching and merging based on enterprise ID, email, or phone
- ✅ Comprehensive validation at multiple levels
- ✅ Work order and procedure management
- ✅ Provider and representative association
- ✅ Consent management
- ✅ Redis-based concurrency control
- ✅ Analytics tracking and event publishing

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────┐
│   Salesforce    │
│      API        │
└────────┬────────┘
         │ POST Request
         ▼
┌─────────────────────────────────────────┐
│   PatientsController                    │
│   - Authentication (HMAC, IP whitelist) │
│   - Request logging                     │
└────────┬────────────────────────────────┘
         │ Enqueues Job
         ▼
┌─────────────────────────────────────────┐
│   CreatePatientJob (High Priority)      │
│   - Redis Semaphore locking             │
│   - Parameter validation                │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│   PatientCreationService                │
│   - Patient matching/merging            │
│   - Demographic data processing         │
│   - Work order processing               │
│   - Resource association                │
└────────┬────────────────────────────────┘
         │
         ├─────────────────┬──────────────┬─────────────┐
         ▼                 ▼              ▼             ▼
┌──────────────┐  ┌──────────────┐  ┌─────────┐  ┌─────────┐
│PatientBuilder│  │UserProcedure │  │Provider │  │   Rep   │
│              │  │Builder       │  │Builder  │  │Builder  │
└──────────────┘  └──────────────┘  └─────────┘  └─────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│   Response Jobs                         │
│   - Identifier Response                 │
│   - Note Response                       │
│   - CIAM ID Response                    │
└─────────────────────────────────────────┘
```

---

## Request Flow

### Step-by-Step Flow

1. **Request Reception**
   - Salesforce sends POST request to `/salesforce/patients/create`
   - Controller validates authentication (HMAC, IP whitelist)
   - Request logged to `IncomingApiRequest` table

2. **Job Enqueuing**
   - `CreatePatientJob` enqueued with high priority
   - Immediate success response returned to Salesforce
   - Job ID: `incoming_api_request_id`

3. **Job Processing**
   - Job retrieves request from `IncomingApiRequest`
   - Status updated to `processing`
   - Redis semaphore lock acquired based on `careProgramEnrolleePatientId`

4. **Validation Phase**
   - `CreatePatientInput` validator checks Salesforce-specific fields
   - `PatientInput` validator checks patient demographic data
   - Errors returned to Salesforce if validation fails

5. **Patient Creation/Matching**
   - Service checks for existing patient by `sf_enterprise_id`
   - If not found, attempts merge by `contact_number` or `email`
   - Creates new patient if no match found

6. **Associated Resource Processing**
   - Work orders and user procedures created
   - Providers and representatives associated
   - Procedure managers assigned
   - Notes created

7. **Post-Processing**
   - Patient data reindexed
   - Analytics events tracked
   - MDM events published for providers

8. **Response Jobs**
   - Identifier response sent to Salesforce
   - Note response sent
   - CIAM ID response sent

9. **Completion**
   - Request status updated to `completed`
   - Semaphore lock released

---

## Key Components

### 1. Controllers

#### `Salesforce::PatientsController`

**Purpose**: Handles incoming Salesforce API requests

**Key Methods**:
- `create`: Logs request and enqueues `CreatePatientJob`

**File**: `app/controllers/salesforce/patients_controller.rb`

```ruby
def create
  log_request_details(:create_patient, create_patient_params)
  Salesforce::CreatePatientJob.new(@incoming_request.id).enqueue
  render_success(I18n.t("patient.create_req_registered"))
end
```

---

### 2. Jobs

#### `Salesforce::CreatePatientJob`

**Queue**: `:high_priority`

**Purpose**: Asynchronously processes patient creation requests

**Key Features**:
- Redis semaphore locking for concurrency control
- Two-stage validation (Salesforce + Patient)
- Comprehensive error handling
- Response job triggering

**File**: `app/jobs/salesforce/create_patient_job.rb`

**Critical Code**:
```ruby
semaphore = Redis::Semaphore.new(
  "sf_create_patient_request_#{create_patient_params[:careProgramEnrolleePatientId]}",
  :redis => $redis, :stale_client_timeout => 300
)

semaphore.lock do
  # Validation
  create_patient_input = Salesforce::Validators::CreatePatientInput.new(create_patient_params)
  patient_input = CaseSharing::PatientInput.new(create_patient_params)
  
  # Processing
  create_service = Salesforce::PatientCreationService.new(patient_input)
  patient = create_service.call
  
  # Response jobs
  submit_identifier_response_job(create_patient_input, patient)
  submit_note_response_job(create_patient_input, patient)
  submit_ciam_id_response_job(patient)
end
```

---

### 3. Services

#### `Salesforce::BasePatientCreationService`

**Purpose**: Core business logic for patient creation

**File**: `app/services/salesforce/base_patient_creation_service.rb`

**Main Method Flow**:
```ruby
def call
  ActiveRecord::Base.transaction do
    if patient_input.is_share_care_program
      fetch_patient_and_set_enterprise_id
    else
      process_patient_demographic_data
    end
    process_work_orders_and_related_data
    send_invites_and_notifications
  end
  
  reindex_patient_data
  track_events
  @patient
end
```

**Key Private Methods**:
- `fetch_patient_and_set_enterprise_id`: Share care program flow
- `process_patient_demographic_data`: Creates or merges patient
- `process_work_orders_and_related_data`: Handles all associated resources
- `process_rep`: Creates representatives and procedure managers
- `process_provider`: Creates providers and MDM events
- `set_consent_attributes`: Manages patient consent
- `track_events`: Analytics and Segment tracking

---

### 4. Model Builders

#### `Salesforce::ModelBuilders::BasePatientBuilder`

**Purpose**: Handles patient finding, creation, and merging logic

**File**: `app/models/salesforce/model_builders/base_patient_builder.rb`

**Patient Matching Strategy**:
```ruby
# 1. Try to find by sf_enterprise_id
@patient = Patient.find_by(sf_enterprise_id:)

# 2. If not found, try contact_number
unless @patient
  @patient = Patient.where(contact_number:, sf_enterprise_id: nil).last
end

# 3. If still not found, try email
@patient = Patient.where(email:, sf_enterprise_id: nil).last if @patient.blank? && email

# 4. Validate name match (first 3 characters)
validate_name_params(first_name, last_name)

# 5. Create new patient if no match
@patient ||= Patient.new(...)
```

**Name Validation**:
```ruby
def validate_name_params(first_name, last_name)
  @patient && (
    (first_name && @patient.first_name[0, 3].downcase != first_name[0, 3].downcase) ||
    (last_name && @patient.last_name[0, 3].downcase != last_name[0, 3].downcase)
  )
end
```

---

### 5. Validators

#### `Salesforce::Validators::BaseCreatePatientInput`

**Purpose**: Validates Salesforce-specific request structure

**File**: `app/models/salesforce/validators/base_create_patient_input.rb`

**Required Fields**:
- `tasks`: Array of task objects
- `sf_enterprise_id`: Salesforce enterprise ID
- `sf_care_program_id`: Care program ID
- `care_program`: Care program details
- `patient_alternate_ids`: Alternate identifier mappings
- `care_program_alternate_ids`: Care program alternate IDs

**Additional Fields**:
- `phones`: Phone number array
- `work_orders`: Work order details
- `work_order_providers`: Provider associations
- `assigned_resources`: Representative assignments
- `appointment_details`: Appointment information
- `product_consumed`: Product information
- `notes`: Patient notes

---

## Patient Creation Process

### Detailed Step-by-Step Process

#### Step 1: Patient Lookup/Creation

**Logic**:
1. Search by `sf_enterprise_id` (exact match)
2. If not found and contact_number provided, search by `contact_number` where `sf_enterprise_id IS NULL`
3. If not found and email provided, search by `email` where `sf_enterprise_id IS NULL`
4. If patient found via contact/email, validate name match (first 3 chars)
5. Create new patient if no match found

**Merge Tracking**:
- `@is_patient_merge = true` when existing patient merged
- Analytics event `sf_patient_merged_with_signup` triggered
- Merge method tracked: `contact_number` or `email`

---

#### Step 2: Patient Attribute Setting

**PatientBuilder Methods**:
```ruby
patient_builder.set_patient_attributes(profile_params)
@patient = patient_builder.patient
@patient.save!

patient_builder.set_additional_info(patient_input.additional_attr)
patient_builder.set_address_attributes(patient_input.address.attrs)
```

**Default Patient Values**:
```ruby
Patient.new(
  role: 5,  # Patient role
  notification_preference: 'SmsNotification',
  confirmed_at: Time.current,
  invite_token: SecureRandom.uuid,
  password: UserService.generate_password,
  needs_password_change: true,
  country: department.country,
  segment_id: SecureRandom.uuid
)
```

---

#### Step 3: Work Order Processing

**For Each Work Order**:
1. Create `UserProcedureBuilder`
2. Set procedure modifier
3. Create or update `UserProcedure`
4. Set composite procedure based on care program
5. Set location from patient ZIP code
6. Set default schedule
7. Trigger `CreateDataForUserProcedureJob`

**Tracking**:
```ruby
@processed_user_procedures[work_order.sf_work_order_id] = user_procedure.id
```

---

#### Step 4: Representative Processing

**For Each Representative**:
1. Create `RepresentativeBuilder`
2. Set account information
3. Save representative (if new or changed)
4. Track if eligible for invite
5. Add to procedure managers list

```ruby
@procedure_managers_list << {
  user_procedure_id: @processed_user_procedures[sf_wo_id],
  user_id: rep.id,
  role: 'patient_advocate',
  is_primary: rep_params[:is_primary],
  sf_work_order_ids: sf_wo_id
}
```

---

#### Step 5: Provider Processing

**For Each Provider**:
1. Create `ProviderBuilder`
2. Set account information
3. Validate email (log if invalid)
4. Save provider (if new or changed)
5. Add to MDM call list if new
6. Add to procedure managers list

**Email Validation**:
```ruby
if email.present? && provider_builder.is_email_invalid
  @provider_email_logs << { provider_id: provider.id, email_parameter: email }
end
```

**MDM Integration**:
```ruby
if @providers_for_mdm_call.present?
  data = { 
    sf_enterprise_ids: @providers_for_mdm_call, 
    source: 'salesforce_create_patient' 
  }
  Rails.configuration.event_store.publish(
    Salesforce::ProviderCreated.new(data: data)
  )
end
```

---

#### Step 6: Procedure Manager Assignment

**Deduplication Strategy**:
```ruby
filtered_procedure_managers_list = @procedure_managers_list.group_by do |manager|
  [manager[:user_procedure_id], manager[:user_id]]
end.map do |_, managers|
  # Prefer primary manager, otherwise take first
  manager = managers.find { |m| m[:is_primary] } || managers.first
  manager.delete(:sf_work_order_ids)
  manager
end

ProcedureManager.insert_all(filtered_procedure_managers_list)
PatientService.manage_patient_relationships(@patient, filtered_procedure_managers_list)
```

---

#### Step 7: Consent Management

**Logic**:
```ruby
consent_params = patient_input.consent_attr
signed_consent = @patient.signed_consents.last

if signed_consent.present?  # Merge scenario
  ::PatientConsentService.update_patient_consent(@patient, consent_params)
else  # New patient
  procedure = ::UserService.get_pending_consent_forms_procedure_for_patient(@patient)
  ::PatientConsentService.create_patient_consent(
    @patient, procedure.consent_form, consent_params
  )
end
```

---

#### Step 8: Notes Creation

**Batch Insert**:
```ruby
@notes_list << {
  user_id: @patient.id,
  **note.attr
}

create_notes if @notes_list.present?
```

---

#### Step 9: Analytics and Tracking

**Events Tracked**:
1. Patient creation or merge event
2. User procedure events
3. Manager identification events

```ruby
if @is_patient_merge
  additional_properties = {
    merged_at: Time.current,
    merge_method: @patient.contact_number.present? ? 'contact_number' : 'email'
  }
  SegmentService.track_event(:sf_patient_merged_with_signup, @patient, additional_properties)
else
  SegmentService.track_event(:sf_patient_created, @patient)
end

SegmentService.track_user_procedures(@patient, @processed_user_procedures.values.flatten)
AnalyticsService.flush if @rep_eligible_for_invite.present? || @providers_for_mdm_call.present?
```

---

## Validation

### Two-Stage Validation

#### Stage 1: Salesforce Input Validation

**Validator**: `Salesforce::Validators::CreatePatientInput`

**Checks**:
- ✅ Required fields present (tasks, sf_enterprise_id, sf_care_program_id)
- ✅ Task structure valid
- ✅ Patient alternate IDs valid
- ✅ Care program structure valid
- ✅ Email format valid (if provided)
- ✅ Date of birth format valid (if provided)

---

#### Stage 2: Patient Input Validation

**Validator**: `CaseSharing::PatientInput`

**Checks**:
- ✅ Patient demographic data valid
- ✅ Address information valid
- ✅ Contact information valid
- ✅ Work order structure valid
- ✅ Provider and rep data valid

---

### Validation Error Handling

**On Validation Failure**:
1. Error messages collected
2. Task response job submitted to Salesforce
3. `ParamsValidationError` exception raised
4. Request status updated to `failed`
5. Error details logged

```ruby
unless create_patient_input.valid?
  submit_task_response_job(create_patient_input)
  raise Salesforce::Exceptions::ParamsValidationError, 
        create_patient_input.errors.map(&:full_message).join(', ')
end
```

---

## Patient Matching and Merging

### Matching Priority

1. **sf_enterprise_id** (Exact Match)
   - Highest priority
   - Unique identifier from Salesforce
   - No merge needed if found

2. **contact_number** (Merge Candidate)
   - Only if `sf_enterprise_id IS NULL`
   - Must pass name validation
   - Triggers merge event

3. **email** (Merge Candidate)
   - Only if `sf_enterprise_id IS NULL`
   - Must pass name validation
   - Triggers merge event

### Name Validation Rules

**During Merge**:
- First name: First 3 characters must match (case-insensitive)
- Last name: First 3 characters must match (case-insensitive)
- Failure raises `ParamsValidationError: "duplicate_contact_info"`

**Example**:
```ruby
# Valid merge
Salesforce: "John Doe"
Existing:   "Johnny Doe" ✅ (First 3: JOH = JOH)

# Invalid merge
Salesforce: "John Doe"
Existing:   "Jane Doe" ❌ (First 3: JOH ≠ JAN)
```

---

### Merge Behavior

**When Merge Occurs**:
1. Existing patient record updated with Salesforce data
2. `sf_enterprise_id` added to existing record
3. Merge tracking flag set: `@is_patient_merge = true`
4. Merge analytics event fired with merge method
5. Existing relationships preserved
6. New work orders/providers/reps added

---

## Associated Resources

### Work Orders and User Procedures

**Creation**:
- Each work order creates a `UserProcedure`
- Composite procedure set based on care program
- Location derived from patient ZIP code
- Default schedule applied
- Processing status: `processing_begin`

**Tracking**:
```ruby
@processed_user_procedures = {
  "SF_WO_123" => user_procedure.id,
  "SF_WO_456" => user_procedure.id
}
```

---

### Providers

**Attributes**:
- Account information
- SF enterprise ID
- Email (validated)
- Contact details

**Features**:
- Automatic MDM event publishing for new providers
- Email validation with logging
- Associated with user procedures via `ProcedureManager`
- Always set as primary provider (`is_primary: true`)

---

### Representatives (Patient Advocates)

**Attributes**:
- Account information
- SF enterprise ID
- Contact details
- Primary flag

**Features**:
- Invite eligibility tracking for new reps
- Associated with user procedures via `ProcedureManager`
- Can be primary or secondary

---

### Notes

**Structure**:
- User ID (patient)
- Note content
- Metadata from Salesforce

**Processing**:
- Collected during processing
- Batch inserted after all validations pass

---

## Error Handling

### Exception Types

| Exception | Trigger | HTTP Status | Action |
|-----------|---------|-------------|--------|
| `ParamsValidationError` | Invalid input data | 400 | Return errors to Salesforce |
| `NotFoundError` | Patient not found (share flow) | 404 | Return error to Salesforce |
| `AuthError` | Authentication failure | 401 | Reject request |
| `StandardError` | Unexpected errors | 500 | Log and return generic error |

---

### Error Response Flow

```ruby
rescue StandardError => exception
  _, message = determine_status_code_and_message(exception)
  patient_input.errors.add(:base, message)
  submit_task_response_job(patient_input)
  raise exception
end
```

**Salesforce Callback**:
- Task response job always triggered on error
- Error details included in response
- Request status updated to `failed`

---

## API Specification

### Endpoint

```
POST /salesforce/patients/create
```

### Authentication

- **Type**: HMAC + IP Whitelist
- **Headers**:
  - `X-Correlation-Id`: Request correlation ID
  - `X-Signature`: HMAC signature
  - `X-Timestamp`: Request timestamp

### Request Body

```json
{
  "careProgramEnrolleePatientId": "SF_PATIENT_123",
  "careProgramID": "CP_001",
  "recordTypeName": "Standard",
  "task": [
    {
      "Subject": "Create Patient",
      "Status": "Pending",
      "CreatedById": "SF_USER_123"
    }
  ],
  "patientAlternateIds": [
    {
      "alternateIdentifierId": "ALT_ID_001",
      "alternateIdentifierType": "MRN",
      "alternateIdentifierValue": "MRN123456"
    }
  ],
  "careProgramAlternateIds": [
    {
      "alternateIdentifierId": "CP_ALT_001",
      "alternateIdentifierType": "ExternalID",
      "alternateIdentifierValue": "EXT_CP_001"
    }
  ],
  "careProgram": {
    "firstName": "John",
    "lastName": "Doe",
    "personEmail": "john.doe@example.com",
    "dateofBirth": "1985-05-15",
    "languageCode": "en"
  },
  "phone": [
    {
      "phoneNumber": "5551234567",
      "defaultIndicator": true,
      "phoneType": "Mobile"
    }
  ],
  "workOrder": [
    {
      "sfWorkOrderId": "WO_001",
      "workOrderNumber": "WO-123456",
      "status": "New",
      "procedureCode": "PROC_001"
    }
  ],
  "workOrderProvider": [
    {
      "sfWorkOrderId": "WO_001",
      "providerId": "PROV_001",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane.smith@hospital.com",
      "isPrimary": true
    }
  ],
  "assignedResource": [
    {
      "sfWorkOrderId": "WO_001",
      "resourceId": "REP_001",
      "firstName": "Mike",
      "lastName": "Johnson",
      "email": "mike.johnson@company.com",
      "isPrimary": true
    }
  ],
  "notes": [
    {
      "noteText": "Patient requires special assistance",
      "noteType": "General"
    }
  ]
}
```

---

### Response

#### Success (202 Accepted)

```json
{
  "status": "success",
  "message": "Patient creation request registered",
  "request_id": "req_abc123"
}
```

#### Error (400 Bad Request)

```json
{
  "status": "error",
  "message": "Validation failed: Email format invalid, Date of birth is required",
  "errors": [
    {
      "field": "personEmail",
      "message": "Email format invalid"
    },
    {
      "field": "dateofBirth",
      "message": "Date of birth is required"
    }
  ]
}
```

---

## Examples

### Example 1: New Patient Creation

```json
{
  "careProgramEnrolleePatientId": "0031234567890ABC",
  "careProgramID": "a1B2C3D4E5F6G7H8",
  "recordTypeName": "Standard Patient",
  "task": [
    {
      "Subject": "New Patient Enrollment",
      "Status": "Not Started",
      "CreatedById": "0051234567890DEF"
    }
  ],
  "patientAlternateIds": [
    {
      "alternateIdentifierId": "a2B3C4D5E6F7G8H9",
      "alternateIdentifierType": "SegmentID",
      "alternateIdentifierValue": "seg_12345678"
    }
  ],
  "careProgram": {
    "firstName": "Emily",
    "lastName": "Rodriguez",
    "personEmail": "emily.rodriguez@email.com",
    "dateofBirth": "1990-08-22",
    "languageCode": "en"
  },
  "phone": [
    {
      "phoneNumber": "5559876543",
      "defaultIndicator": true,
      "phoneType": "Mobile"
    }
  ],
  "workOrder": [
    {
      "sfWorkOrderId": "0WO1234567890GHI",
      "workOrderNumber": "WO-2024-001",
      "status": "New",
      "procedureCode": "KNEE_REPLACEMENT"
    }
  ],
  "workOrderProvider": [
    {
      "sfWorkOrderId": "0WO1234567890GHI",
      "providerId": "0031234567890JKL",
      "firstName": "Dr. Sarah",
      "lastName": "Chen",
      "email": "sarah.chen@hospital.com",
      "isPrimary": true
    }
  ],
  "assignedResource": [
    {
      "sfWorkOrderId": "0WO1234567890GHI",
      "resourceId": "0051234567890MNO",
      "firstName": "Maria",
      "lastName": "Garcia",
      "email": "maria.garcia@company.com",
      "isPrimary": true
    }
  ]
}
```

**Result**: New patient created with 1 procedure, 1 provider, 1 rep

---

### Example 2: Patient Merge by Email

**Scenario**: Self-signup patient exists, Salesforce sends with same email

**Existing Patient**:
- Email: `john.doe@email.com`
- First Name: `Johnny`
- Last Name: `Doe`
- `sf_enterprise_id`: `NULL`

**Salesforce Request**:
```json
{
  "careProgramEnrolleePatientId": "0031234567890XYZ",
  "careProgram": {
    "firstName": "John",
    "lastName": "Doe",
    "personEmail": "john.doe@email.com"
  }
}
```

**Result**:
- Existing patient updated with `sf_enterprise_id: "0031234567890XYZ"`
- Name validation passes (JOH = JOH)
- Analytics event: `sf_patient_merged_with_signup` (method: `email`)

---

### Example 3: Patient Merge Failure (Name Mismatch)

**Existing Patient**:
- Phone: `5551234567`
- First Name: `Robert`
- `sf_enterprise_id`: `NULL`

**Salesforce Request**:
```json
{
  "careProgramEnrolleePatientId": "0031234567890ABC",
  "careProgram": {
    "firstName": "Michael",
    "personEmail": null
  },
  "phone": [
    {"phoneNumber": "5551234567"}
  ]
}
```

**Result**:
- Merge attempted by phone
- Name validation fails (ROB ≠ MIC)
- Error: `ParamsValidationError: duplicate_contact_info`
- Request failed, no patient created

---

## Troubleshooting

### Common Issues

#### 1. Duplicate Processing

**Symptom**: Multiple patients created for same request

**Cause**: Redis semaphore not locking properly

**Solution**:
- Check Redis connection
- Verify `careProgramEnrolleePatientId` is unique
- Check semaphore timeout settings

---

#### 2. Patient Merge Not Working

**Symptom**: New patient created instead of merging

**Checklist**:
- ✅ Existing patient has `sf_enterprise_id = NULL`
- ✅ Email/phone exactly matches (including format)
- ✅ First 3 characters of first/last name match

**Debug**:
```ruby
# Check for matching patient
Patient.where(email: 'john.doe@email.com', sf_enterprise_id: nil).last
Patient.where(contact_number: '5551234567', sf_enterprise_id: nil).last
```

---

#### 3. Work Order Not Created

**Symptom**: Patient created but no procedures

**Possible Causes**:
- Work order ID in ignore list
- Procedure code invalid
- Composite procedure not found
- User procedure validation failed

**Debug**:
```ruby
# Check work order processing
@work_order_ids_to_ignore
@processed_user_procedures
```

---

#### 4. Provider Not Associated

**Symptom**: Provider created but not linked to procedure

**Checklist**:
- ✅ `sfWorkOrderId` matches between workOrder and workOrderProvider
- ✅ Work order was successfully processed
- ✅ Provider builder didn't fail

**Check**:
```ruby
ProcedureManager.where(user_procedure_id: X, role: 'provider')
```

---

#### 5. Validation Errors

**Common Validation Failures**:

| Error | Field | Fix |
|-------|-------|-----|
| Email format invalid | `personEmail` | Ensure valid email format |
| Date format invalid | `dateofBirth` | Use YYYY-MM-DD format |
| Required field missing | Various | Check required fields list |
| Name mismatch | `firstName`/`lastName` | Check first 3 chars match |

---

## Additional Resources

### Related Documentation
- [PatientsController Documentation](controllers/PatientsController.md)
- Salesforce API Documentation
- MDM Integration Guide

### Key Files
- `app/controllers/salesforce/patients_controller.rb`
- `app/jobs/salesforce/create_patient_job.rb`
- `app/services/salesforce/base_patient_creation_service.rb`
- `app/models/salesforce/model_builders/base_patient_builder.rb`
- `app/models/salesforce/validators/base_create_patient_input.rb`

### Support
For issues or questions, contact the MDT Salesforce Integration team.

---

**Last Updated**: 2025-12-09  
**Version**: 1.0  
**Maintained by**: MDT Engineering Team
