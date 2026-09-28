import { BadRequestException, HttpStatus, NotFoundException } from "@nestjs/common";
import { AllExceptionsFilter } from "./http-exception.filter";

const makeHost = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: "GET", url: "/api/v1/test" }),
      }),
    } as never,
    status,
    json,
  };
};

describe("AllExceptionsFilter", () => {
  it("formats HttpExceptions into the standard error body", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException("Widget not found"), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Widget not found",
        error: { code: "NOT_FOUND", details: null },
      }),
    );
  });

  it("maps validation errors to VALIDATION_ERROR with details", () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();
    filter.catch(new BadRequestException(["name must be a string", "amount must be a number"]), host);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("must be");
    expect(body.error.details).toHaveLength(2);
  });

  it("formats unknown errors as 500 INTERNAL_SERVER_ERROR", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();
    filter.catch(new Error("boom"), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json.mock.calls[0][0].error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
