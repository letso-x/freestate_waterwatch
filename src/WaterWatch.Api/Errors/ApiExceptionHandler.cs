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
        context.Response.StatusCode = databaseFailure ? 503 : 500;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails
            {
                Status = context.Response.StatusCode,
                Title = databaseFailure ? "Database unavailable" : "An unexpected error occurred",
                Detail = "Please try again later.",
                Extensions = { ["traceId"] = context.TraceIdentifier }
            }
        });
    }
}

