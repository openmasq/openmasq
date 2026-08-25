import { describe, it, expect, vi } from "vitest";
import { parseOperations, pickOperation, resolveOperation } from "./operationResolver";

// Real-shaped `stripe_api_search` output (from the logs).
const CREATE_ONLY = `Found 2 matching operations in OpenAPI spec version 2026-07-01.preview:

## PostCustomers
  POST /v1/customers
  Create a customer

  Body params: address (object), email (string), name (string)`;

// A broader/retrieve search that lists the instance operations too.
const CUSTOMER_OPS = `Found 3 matching operations in OpenAPI spec version 2026-07-01.preview:

## GetCustomersCustomer
  GET /v1/customers/{customer}
  Retrieve a customer

## PostCustomersCustomer
  POST /v1/customers/{customer}
  Update a customer

## DeleteCustomersCustomer
  DELETE /v1/customers/{customer}
  Delete a customer`;

const NONE = "No matching operations found in OpenAPI spec version 2026-07-01.preview.";

describe("parseOperations", () => {
  it("extracts operationId + method + path + summary", () => {
    const ops = parseOperations(CUSTOMER_OPS);
    expect(ops).toEqual([
      { operationId: "GetCustomersCustomer", method: "GET", path: "/v1/customers/{customer}", summary: "Retrieve a customer" },
      { operationId: "PostCustomersCustomer", method: "POST", path: "/v1/customers/{customer}", summary: "Update a customer" },
      { operationId: "DeleteCustomersCustomer", method: "DELETE", path: "/v1/customers/{customer}", summary: "Delete a customer" },
    ]);
  });
  it("returns [] for a no-match message", () => {
    expect(parseOperations(NONE)).toEqual([]);
  });
});

describe("pickOperation (REST method + path shape only)", () => {
  const ops = parseOperations(CUSTOMER_OPS).concat(parseOperations(CREATE_ONLY));
  it("update → the instance-level POST (not the collection create)", () => {
    expect(pickOperation(ops, "update")?.operationId).toBe("PostCustomersCustomer");
  });
  it("create → the collection-level POST", () => {
    expect(pickOperation(ops, "create")?.operationId).toBe("PostCustomers");
  });
  it("retrieve → the instance GET", () => {
    expect(pickOperation(ops, "retrieve")?.operationId).toBe("GetCustomersCustomer");
  });
  it("delete → the DELETE", () => {
    expect(pickOperation(ops, "delete")?.operationId).toBe("DeleteCustomersCustomer");
  });
  it("returns null when no op of the right method exists", () => {
    expect(pickOperation(parseOperations(CREATE_ONLY), "delete")).toBeNull();
  });
  it("accepts a free-form intent PHRASE (not just the verb)", () => {
    expect(pickOperation(ops, "update customer name")?.operationId).toBe("PostCustomersCustomer");
    expect(pickOperation(ops, "modify the customer details")?.operationId).toBe("PostCustomersCustomer");
    expect(pickOperation(ops, "get details of a specific customer")?.operationId).toBe("GetCustomersCustomer");
  });
});

describe("resolveOperation (live-derived, drift-free)", () => {
  it("finds the update op via a broader search after the direct intent returns nothing", async () => {
    const discover = vi.fn(async ({ intent }: { intent: string }) =>
      /update|modify|edit/.test(intent) ? NONE : CUSTOMER_OPS,
    );
    const op = await resolveOperation(discover, { resource: "customer", action: "update" });
    expect(op?.operationId).toBe("PostCustomersCustomer");
    // The operationId came straight from the live text — never hardcoded here.
    expect(discover).toHaveBeenCalled();
  });

  it("returns null when discovery never yields the operation (caller falls back)", async () => {
    const discover = vi.fn(async () => NONE);
    expect(await resolveOperation(discover, { resource: "customer", action: "update" })).toBeNull();
  });

  it("skips a discovery call that throws, then succeeds on the next", async () => {
    let n = 0;
    const discover = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("rate limited");
      return CUSTOMER_OPS;
    });
    const op = await resolveOperation(discover, { resource: "customer", action: "update" });
    expect(op?.operationId).toBe("PostCustomersCustomer");
  });
});
