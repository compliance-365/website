# Keeping website leads in HubSpot

Once this is set up, every website enquiry and sign-up becomes, or updates, a contact in HubSpot. That covers:
- the contact form;
- the booking page message;
- the posture scan remediation plan request;
- the six readiness checklists;
- the newsletter and "email me when ASD publishes" sign-ups;
- the free roadmap.

The emails you already get don't change. HubSpot is an extra copy, so you can report on where clients come from and email a list.

## What each contact gets

- **Name, email and company**, where the form asked for them. New contacts are created with lifecycle stage **Lead**.
- **How they found the site**, set once and never overwritten:
  - First website visit (date)
  - First page seen
  - First referring site
  - Campaign source, medium and name (from `utm_` tags)
  - Came from an ad click (Google Ads or Microsoft Ads)

  These come from the visitor's first visit only if they accepted analytics cookies. Otherwise they come from the page they sent the form from.
- **Updated on every submission:** Last website form, and Last page a form was sent from.
- **Sign-up flags:** Monthly digest sign-up and Essentials series release alert sign-up. Each is set to Yes when they sign up.
- **A note** with the enquiry text, or what they signed up for.

The custom properties all start with `c365_`, sit in the Contact information group, and are created automatically the first time a lead arrives.

Enquiries from `@compliance365.com.au` addresses are skipped, so your own tests don't fill the CRM. The privacy policy (section 11) says enquiries and sign-ups are kept in HubSpot.

## 1. Create a HubSpot private app token

1. In HubSpot: **Settings (gear) → Integrations → Private Apps → Create a private app**. If your account shows **Development → Legacy apps** instead, choose **Create legacy app → Private**.
2. Name it `Compliance365 website`.
3. On **Scopes**, tick:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.contacts.write` (lets the Lambda create the `c365_` properties)
4. Click **Create app**, then copy the **access token**. It starts with `pat-`.

## 2. Update the sign-up Lambda

The website already sends sign-ups to `https://uclqeiwzgi.execute-api.ap-southeast-2.amazonaws.com/NewDeploy/subscribe`. To find its Lambda:
1. Go to **API Gateway**.
2. Open the API with ID `uclqeiwzgi`.
3. Go to **Routes**, open `/subscribe`, and the integration names the Lambda.

Then, on that Lambda:
1. **Code** tab: replace the code with `lambda/subscribe.js` and click **Deploy**.
2. **Configuration → Environment variables**: add `HUBSPOT_TOKEN` = the token from step 1.
3. **Configuration → General configuration**: set the timeout to **10 sec**.

Until you redeploy, the website's lead copies are rejected harmlessly by the old code, so nothing is emailed twice. Without `HUBSPOT_TOKEN`, the new code behaves exactly as before.

## 3. Test it

1. Send the contact form from a non-Compliance365 address, for example a personal Gmail.
2. In HubSpot, open **Contacts**. The contact appears with the note and the `c365_` properties. To show them as columns, use **Edit columns** and search "c365" or the labels above.
3. If it doesn't appear, check the Lambda's **Monitor → CloudWatch logs** for `HubSpot lead failed`, which includes HubSpot's reason. A `403` means a scope is missing from step 1.

## Using it

- **Who signed up for the ASD alert:** Contacts → filter **Essentials series release alert sign-up** is **Yes** → Save as a segment (list). When ASD publishes, email that segment.
- **Where clients come from:** Reports → Create report → Contacts. Group by **First referring site** or **Campaign source**, filtered to lifecycle stage Customer.
