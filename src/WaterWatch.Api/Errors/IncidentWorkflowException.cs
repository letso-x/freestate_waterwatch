namespace WaterWatch.Api.Errors;

public sealed class IncidentWorkflowException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
