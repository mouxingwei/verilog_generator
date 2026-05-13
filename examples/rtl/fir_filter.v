module fir_filter #(
    parameter DATA_W = 16,
    parameter FRAC_W = 0
) (
    input clk,
    input rst_n,
    input signed [DATA_W-1:0] din,
    output signed [DATA_W-1:0] dout
);

assign dout = din;

endmodule

