using System.Net;

namespace WaterWatch.Api.Tests;

public sealed class LocalStaffAccessTests
{
    [Theory]
    [InlineData("Development", true, "127.0.0.1", null, true)]
    [InlineData("Development", true, "::1", "http://localhost:5173", true)]
    [InlineData("Development", false, "127.0.0.1", null, false)]
    [InlineData("Production", true, "127.0.0.1", null, false)]
    [InlineData("Development", true, "192.0.2.1", null, false)]
    [InlineData("Development", true, "127.0.0.1", "https://untrusted.example", false)]
    public async Task LocalAccess_IsLimitedToConfiguredDevelopmentLoopback(string environment, bool enabled, string address, string? origin, bool allowed)
    {
        using var factory = new ApiFactory(localStaffAccess: enabled, remoteAddress: address, environmentName: environment);
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = null;
        if (origin is not null) client.DefaultRequestHeaders.Add("Origin", origin);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Unauthorized, (await client.GetAsync("/api/sensors")).StatusCode);
        // Local staff access never substitutes for the sensor ingestion credential.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/telemetry", new StringContent("{}", System.Text.Encoding.UTF8, "application/json"))).StatusCode);
    }

    [Fact]
    public async Task LocalAccess_RejectsUntrustedHostAndExplicitInvalidCredential()
    {
        using var factory = new ApiFactory(localStaffAccess: true, remoteAddress: "127.0.0.1"); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = null;
        client.DefaultRequestHeaders.Host = "untrusted.example";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
        client.DefaultRequestHeaders.Host = "localhost";
        client.DefaultRequestHeaders.Authorization = new("Bearer", "invalid-credential");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
    }
}
