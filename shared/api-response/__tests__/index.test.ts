import { sendSuccess, sendError, HTTP_STATUS } from "../index";

describe("API Response Utilities", () => {
  let mockRes: any;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe("sendSuccess", () => {
    it("should send success response with default status code", () => {
      sendSuccess(mockRes, { id: 1 }, "Success");

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Success",
        data: { id: 1 },
      });
    });

    it("should send success response with custom status code", () => {
      sendSuccess(mockRes, { id: 1 }, "Created", HTTP_STATUS.CREATED);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Created",
        data: { id: 1 },
      });
    });
  });

  describe("sendError", () => {
    it("should send error response with default status code", () => {
      sendError(mockRes, "Error occurred");

      expect(mockRes.status).toHaveBeenCalledWith(
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Error occurred",
        error: {
          code: "INTERNAL_ERROR",
        },
      });
    });

    it("should send error response with custom error code and details", () => {
      sendError(
        mockRes,
        "Validation failed",
        "VALIDATION_ERROR",
        { field: "email" },
        HTTP_STATUS.VALIDATION_ERROR
      );

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.VALIDATION_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          details: { field: "email" },
        },
      });
    });
  });
});
