---
title: Mock Data with Faker
description: Generate realistic mock test payloads dynamically using integrated @faker-js/faker.
---

# Mock Data with Faker

Writing realistic test payloads by hand is tedious and leads to brittle tests. RestIO includes the full `@faker-js/faker` library built directly into the scripting runtime.

You can use `faker` or `rio.faker` directly in any Pre-request or Post-response script with **zero installation or setup required**.

---

## Basic Usage

Inside the **Pre-request** tab of any request:

```javascript
// Access faker directly
const firstName = faker.person.firstName();
const email = faker.internet.email();
const amount = faker.finance.amount();

console.log(`Generated user: ${firstName} (${email})`);
```

---

## Two Ways to Use Mock Data

### Method 1: Dynamically Inject the Outbound Request Body

You can override `rio.request.body` directly in your pre-request script:

```javascript
// Construct a complete realistic JSON payload
const newAccount = {
  name: faker.person.fullName(),
  email: faker.internet.email(),
  jobTitle: faker.person.jobTitle(),
  company: faker.company.name(),
  phone: faker.phone.number(),
  avatarUrl: faker.image.avatar(),
  billingAddress: {
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zipCode: faker.location.zipCode(),
    country: faker.location.country(),
  },
  registeredAt: faker.date.recent().toISOString(),
};

// Set as outbound JSON body
rio.request.body = JSON.stringify(newAccount, null, 2);
```

### Method 2: Set Dynamic Environment Variables

Set individual fields into environment variables to interpolate inside your URL, query parameters, or static body templates:

```javascript
// In Pre-request script:
rio.setEnv("randomEmail", faker.internet.email());
rio.setEnv("randomUUID", faker.string.uuid());
rio.setEnv("randomPrice", faker.commerce.price({ min: 10, max: 250 }));
```

In your URL or body template:

```json
{
  "orderId": "{{randomUUID}}",
  "customerEmail": "{{randomEmail}}",
  "price": {{randomPrice}}
}
```

---

## Popular Faker Modules Available

| Module               | Examples                                                              |
| :------------------- | :-------------------------------------------------------------------- |
| **`faker.person`**   | `fullName()`, `firstName()`, `lastName()`, `jobTitle()`, `bio()`      |
| **`faker.internet`** | `email()`, `username()`, `password()`, `ipv4()`, `url()`, `mac()`     |
| **`faker.company`**  | `name()`, `catchPhrase()`, `buzzPhrase()`                             |
| **`faker.location`** | `city()`, `country()`, `streetAddress()`, `latitude()`, `longitude()` |
| **`faker.finance`**  | `accountNumber()`, `amount()`, `currencyCode()`, `bitcoinAddress()`   |
| **`faker.commerce`** | `productName()`, `department()`, `price()`, `productDescription()`    |
| **`faker.date`**     | `past()`, `future()`, `recent()`, `birthdate()`                       |
| **`faker.string`**   | `uuid()`, `alphanumeric(10)`, `nanoid()`, `sample()`                  |
