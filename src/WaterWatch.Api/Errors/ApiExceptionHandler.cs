using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace WaterWatch.Api.Errors;

public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    private static bool IsDatabaseFailure(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is NpgsqlException or DbUpdateException or TimeoutException)
                return true;
        return false;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var databaseFailure = IsDatabaseFailure(exception);
        context.Response.StatusCode = exception is IncidentWorkflowException workflow ? workflow.StatusCode : exception is DbUpdateConcurrencyException ? 409 : databaseFailure ? 503 : 500;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails
            {
                Status = context.Response.StatusCode,
                Title = context.Response.StatusCode switch { 400 => "Invalid incident update", 404 => "Incident not found", 409 => "Incident changed concurrently", 503 => "Database unavailable", _ => "An unexpected error occurred" },
                Detail = exception is IncidentWorkflowException expected ? expected.Message : context.Response.StatusCode == 409 ? "Another operator changed this incident. Refresh it before trying again." : "Please try again later.",
                Extensions = { ["traceId"] = context.TraceIdentifier }
            }
        });
    }
}

