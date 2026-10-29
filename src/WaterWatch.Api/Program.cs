using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Data;
using WaterWatch.Api.Errors;
using WaterWatch.Api.Services;

var builder = WebApplication.CreateBuilder(args);
// Console logging also works without Windows Event Log write permissions.
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
var connectionString = builder.Configuration.GetConnectionString("WaterWatch");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Set ConnectionStrings__WaterWatch to a PostgreSQL connection string.");
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddDbContext<WaterWatchDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddScoped<IncidentService>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.MapControllers();
app.Run();
public partial class Program;

